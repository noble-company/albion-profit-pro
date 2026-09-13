"""Escrita do histórico da API pública em `market_history_entry` (task 4/23).

A tabela é a mesma do histórico do nosso client, e o rollup diário agrega as duas fontes do mesmo
jeito. Os blocos de 6 h das duas caem nas mesmas 00/06/12/18 UTC, e a restrição única por bloco
(`uq_market_history_bucket`) garante uma linha só — a mesma venda nunca conta duas vezes.

**No mesmo bloco, o client vence.** O dado dele vem direto do servidor do jogo, com a prata
exata; o da API pública é agregado e arredonda o preço médio. Por isso o upsert daqui só atualiza
linha que já é `aodp`, e o ingest do client (`ingest/service.py`) sempre sobrescreve.
"""

from sqlalchemy import func, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.items.models import Item
from src.prices.models import MarketHistoryEntry
from src.prices.snapshot import SOURCE_AODP

# 9 colunas por linha: 2.000 linhas são 18.000 parâmetros, longe dos 32.767 do asyncpg — o limite
# que parou o rollup (achado `W8`).
LINHAS_POR_INSERT = 2_000


async def upsert_history_aodp(session: AsyncSession, server_id: str, rows: list[dict]) -> int:
    """Grava blocos da API pública. Não faz commit — quem chama decide a transação."""
    for inicio in range(0, len(rows), LINHAS_POR_INSERT):
        lote = [
            {**row, "server_id": server_id} for row in rows[inicio : inicio + LINHAS_POR_INSERT]
        ]
        stmt = pg_insert(MarketHistoryEntry).values(lote)
        stmt = stmt.on_conflict_do_update(
            constraint="uq_market_history_bucket",
            set_={
                "item_amount": stmt.excluded.item_amount,
                "silver_amount": stmt.excluded.silver_amount,
                "last_seen_at": func.now(),
            },
            # A precedência inteira mora aqui: bloco que o client já gravou não é tocado.
            where=MarketHistoryEntry.source == SOURCE_AODP,
        )
        await session.execute(stmt)
    return len(rows)


async def remapear_historico_da_api(session: AsyncSession, novos: dict[str, int]) -> int:
    """Move o histórico da API pública para o `albion_id` novo de cada nome (task 4/28).

    O jogo renumera os itens entre patches — entre as revisões de 27/07 e 08/09 do dataset, 12.049
    dos 12.071 índices mudaram (achado `W9`). O histórico do **client** guarda o número do jogo e se
    corrige sozinho com o dataset novo. O da **API pública** não: ela fala o nome, e o número gravado
    foi o que o dataset anterior dava a ele. Sem mover, a atualização só trocaria qual das duas
    fontes está errada.

    Tem que rodar **antes** de trocar a tabela `item`, que é o único lugar que ainda sabe o número
    antigo de cada nome, e na mesma transação. As linhas saem e voltam com o número novo; no bloco
    que o client já tem, o client continua (`DO NOTHING`). Devolve quantas linhas voltaram.
    """
    antigos = dict(
        (
            await session.execute(
                select(Item.unique_name, Item.albion_id).where(Item.albion_id.is_not(None))
            )
        ).all()
    )
    # Nome que saiu do jogo vai com `novo` nulo: o número dele pode ser de outro item agora, então
    # o histórico da API sai e não volta.
    pares = [
        (antigo, novos.get(nome)) for nome, antigo in antigos.items() if novos.get(nome) != antigo
    ]
    if not pares:
        return 0

    await session.execute(
        text("CREATE TEMP TABLE mapa_albion (antigo bigint PRIMARY KEY, novo bigint)")
    )
    # Dois parâmetros de array, não um por par: são milhares de nomes (achado `W8`).
    await session.execute(
        text(
            "INSERT INTO mapa_albion (antigo, novo) "
            "SELECT * FROM unnest(CAST(:antigos AS bigint[]), CAST(:novos AS bigint[]))"
        ),
        {"antigos": [antigo for antigo, _ in pares], "novos": [novo for _, novo in pares]},
    )
    # `CREATE TABLE AS` não aceita parâmetro; a fonte é constante do código, não entrada.
    await session.execute(
        text(
            "CREATE TEMP TABLE historico_movido AS "
            "SELECT e.id, e.server_id, m.novo AS item_id, e.location_id, e.quality_level, "
            "e.bucket_seconds, e.bucket_start, e.item_amount, e.silver_amount, e.source, "
            "e.first_seen_at, e.last_seen_at "
            "FROM market_history_entry e JOIN mapa_albion m ON m.antigo = e.item_id "
            f"WHERE e.source = '{SOURCE_AODP}' AND m.novo IS NOT NULL"
        )
    )
    await session.execute(
        text(
            "DELETE FROM market_history_entry e USING mapa_albion m "
            f"WHERE e.item_id = m.antigo AND e.source = '{SOURCE_AODP}'"
        )
    )
    resultado = await session.execute(
        text(
            "INSERT INTO market_history_entry (id, server_id, item_id, location_id, "
            "quality_level, bucket_seconds, bucket_start, item_amount, silver_amount, source, "
            "first_seen_at, last_seen_at) "
            "SELECT id, server_id, item_id, location_id, quality_level, bucket_seconds, "
            "bucket_start, item_amount, silver_amount, source, first_seen_at, last_seen_at "
            "FROM historico_movido "
            "ON CONFLICT ON CONSTRAINT uq_market_history_bucket DO NOTHING"
        )
    )
    await session.execute(text("DROP TABLE historico_movido"))
    await session.execute(text("DROP TABLE mapa_albion"))
    return resultado.rowcount
