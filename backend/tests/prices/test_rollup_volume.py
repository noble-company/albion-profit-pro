"""O rollup parou quando o histórico cresceu (achado de 2026-09-10).

`_rollup_diario` e `_rollup_mensal` montavam um `INSERT ... VALUES` com uma linha de parâmetros
por linha agregada: 8 colunas por linha. Acima de 4.095 linhas passa do limite de 32.767 parâmetros
do asyncpg, e o job levantava `InterfaceError` — classificado como transitório, então tentava de
novo e caía de novo. O histórico local já pedia 11.210 linhas diárias; a tabela diária estava
parada em 2.194. O job `poda` falhava junto, porque repara os resumos antes de apagar o bruto.
"""

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func, select

from src.database import async_session_maker
from src.prices.models import MarketHistoryDaily, MarketHistoryEntry, MarketHistoryMonthly
from src.prices.tasks import _repair_rollups

# 8 parâmetros por linha no INSERT antigo: 4.096 linhas já passam de 32.767.
LINHAS = 4_200


async def test_rollup_com_mais_linhas_do_que_cabem_em_parametros(db_session):
    now = datetime(2026, 9, 10, 12, 0, tzinfo=timezone.utc)
    ontem = datetime(2026, 9, 9, tzinfo=timezone.utc)
    base = 800_000_000 + (uuid.uuid4().int % 50_000_000)

    # Um item por linha diária; os quatro blocos de 6 h do dia se revezam entre os itens.
    db_session.add_all(
        [
            MarketHistoryEntry(
                server_id="west",
                item_id=base + i,
                location_id="1002",
                quality_level=1,
                bucket_seconds=21600,
                bucket_start=ontem + timedelta(hours=6 * (i % 4)),
                item_amount=10,
                silver_amount=Decimal("250"),
            )
            for i in range(LINHAS)
        ]
    )
    await db_session.commit()

    await _repair_rollups(async_session_maker, now)

    faixa_diaria = (MarketHistoryDaily.item_id >= base, MarketHistoryDaily.item_id < base + LINHAS)
    faixa_mensal = (
        MarketHistoryMonthly.item_id >= base,
        MarketHistoryMonthly.item_id < base + LINHAS,
    )
    diarias = await db_session.scalar(
        select(func.count()).select_from(MarketHistoryDaily).where(*faixa_diaria)
    )
    mensais = await db_session.scalar(
        select(func.count()).select_from(MarketHistoryMonthly).where(*faixa_mensal)
    )
    assert diarias == LINHAS
    assert mensais == LINHAS

    # E o valor continua o da média ponderada: 250 de prata por 10 unidades.
    amostra = await db_session.scalar(
        select(MarketHistoryDaily).where(MarketHistoryDaily.item_id == base + 7)
    )
    assert (amostra.dia, amostra.item_amount, amostra.silver_amount, amostra.preco_medio) == (
        ontem.date(),
        10,
        Decimal("250"),
        Decimal("25.0000"),
    )
