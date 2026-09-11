"""Escrita do histórico da API pública em `market_history_entry` (task 4/23).

A tabela é a mesma do histórico do nosso client, e o rollup diário agrega as duas fontes do mesmo
jeito. Os blocos de 6 h das duas caem nas mesmas 00/06/12/18 UTC, e a restrição única por bloco
(`uq_market_history_bucket`) garante uma linha só — a mesma venda nunca conta duas vezes.

**No mesmo bloco, o client vence.** O dado dele vem direto do servidor do jogo, com a prata
exata; o da API pública é agregado e arredonda o preço médio. Por isso o upsert daqui só atualiza
linha que já é `aodp`, e o ingest do client (`ingest/service.py`) sempre sobrescreve.
"""

from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

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
