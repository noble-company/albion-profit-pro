"""Task 3.6/09 (E08): prova que o índice trigram declarado em `Item.__table_args__` é
**usado** de verdade pela consulta de busca, não só que ele existe. Uma tabela pequena faz o
planner do Postgres preferir seq scan mesmo com o índice presente -- o custo de um bitmap index
scan só compensa a partir de um volume bem além do de produção (~12 mil itens; testado: 12 mil e
até 120 mil linhas ainda perdiam pra seq scan, cujo custo por linha é minúsculo numa tabela
estreita). Por isso este teste semeia um volume bem maior, gerado **no próprio Postgres** (não
linha a linha via Python -- um `executemany` de centenas de milhares de linhas pela rede é lento
demais pra um teste).
"""

from sqlalchemy import text


async def test_item_search_query_uses_trigram_index_not_sequential_scan(db_session):
    # Gerado server-side com `generate_series` -- rápido mesmo em volume bem maior que produção,
    # e a largura por linha (texto de `md5()`, repetido) fica na mesma ordem de grandeza da
    # busca_normalizada real (`normalize_item_search` concatena unique_name + nome PT + nome EN).
    await db_session.execute(
        text(
            "INSERT INTO item (unique_name, busca_normalizada, enchantment_level) "
            "SELECT 'T' || (1 + (s % 8))::text || '_SYNTHETIC_' || s, "
            "       md5(s::text) || ' ' || md5((s + 1)::text) || ' ' || md5((s + 2)::text), "
            "       0 "
            "FROM generate_series(1, 500000) AS s"
        )
    )
    await db_session.commit()
    # Sem isto o planner decide com estatísticas desatualizadas (a tabela estava vazia até
    # agora nesta sessão de teste) e o resultado não reflete uma decisão real.
    await db_session.execute(text("ANALYZE item"))

    plan_rows = (
        (
            await db_session.execute(
                text("EXPLAIN SELECT unique_name FROM item WHERE busca_normalizada LIKE '%abc%'")
            )
        )
        .scalars()
        .all()
    )
    plan_text = "\n".join(plan_rows)

    assert "Seq Scan" not in plan_text, plan_text
    assert "ix_item_busca_normalizada_trgm" in plan_text, plan_text
