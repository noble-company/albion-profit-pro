"""Task 4/29 — o diário da série é recalculado no próprio upload do histórico.

`GET /prices/sales` lê só `market_history_daily`, que o rollup refaz de hora em hora. Medido ao
vivo (achado `W11`): o bloco que o client mandava depois do minuto zero esperava o rollup seguinte
— séries que chegaram antes das 03:00 batiam em 836/836 dias, as de depois divergiam em 84/110.

Chama `save_market_history` direto, pelo mesmo motivo de `test_market_history_bucket.py`.
"""

import asyncio
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import select

from src.cache.redis_client import get_redis
from src.database import async_session_maker
from src.ingest.normalize import TICKS_PER_SECOND, TICKS_UNIX_EPOCH
from src.ingest.service import save_market_history
from src.prices.models import MarketHistoryDaily, MarketHistoryEntry
from src.prices.rollup import tentar_lock_do_ingest, tomar_lock_do_rollup
from src.prices.snapshot import SOURCE_AODP
from src.prices.tasks import _rollup_diario

HOJE = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
ONTEM = HOJE - timedelta(days=1)
ANTEONTEM = HOJE - timedelta(days=2)
ITEM = 930_291


def _payload(pontos, *, item=ITEM, location="1002", quality=1, timescale=1) -> dict:
    """`pontos` = [(início do bloco, unidades, prata)]. Prata do wire vem × 10.000."""
    return {
        "albion_id": item,
        "location_id": location,
        "quality_level": quality,
        "timescale": timescale,
        "histories": [
            {
                "timestamp": int(inicio.timestamp()) * TICKS_PER_SECOND + TICKS_UNIX_EPOCH,
                "item_amount": unidades,
                "silver_amount": prata * 10_000,
            }
            for inicio, unidades, prata in pontos
        ],
    }


async def _diario(db_session, item=ITEM) -> dict:
    db_session.expire_all()
    linhas = await db_session.scalars(
        select(MarketHistoryDaily).where(MarketHistoryDaily.item_id == item)
    )
    return {
        (d.server_id, d.location_id, d.quality_level, d.dia): (d.item_amount, d.silver_amount)
        for d in linhas
    }


async def test_upload_de_6h_atualiza_o_diario_da_serie_na_hora(db_session):
    """A soma relê o dia inteiro, inclusive o bloco que veio da API pública — e dá o mesmo que o
    rollup completo daria."""
    db_session.add(
        MarketHistoryEntry(
            server_id="west",
            item_id=ITEM,
            location_id="1002",
            quality_level=1,
            bucket_seconds=21600,
            bucket_start=ONTEM,
            item_amount=10,
            silver_amount=Decimal("3000"),
            source=SOURCE_AODP,
        )
    )
    await db_session.commit()

    await save_market_history(
        async_session_maker,
        get_redis(),
        _payload(
            [(ONTEM + timedelta(hours=6), 50, 15000), (ANTEONTEM + timedelta(hours=12), 30, 600)]
        ),
        "west",
    )

    esperado = {
        ("west", "1002", 1, ONTEM.date()): (60, Decimal("18000")),
        ("west", "1002", 1, ANTEONTEM.date()): (30, Decimal("600")),
    }
    assert await _diario(db_session) == esperado

    # O rollup de hora em hora não muda nada: a conta é a mesma.
    await _rollup_diario(async_session_maker)
    assert await _diario(db_session) == esperado


async def test_bloco_de_hoje_e_bloco_fora_da_retencao_nao_viram_diario(db_session):
    """Mesmos limites do rollup: o dia de hoje ainda não fechou, e o dia na borda dos 90 dias
    pode já ter perdido blocos."""
    await save_market_history(
        async_session_maker,
        get_redis(),
        _payload([(HOJE, 5, 50), (HOJE - timedelta(days=100), 7, 70)]),
        "west",
    )

    entradas = await db_session.scalars(
        select(MarketHistoryEntry).where(MarketHistoryEntry.item_id == ITEM)
    )
    assert len(entradas.all()) == 2
    assert await _diario(db_session) == {}


async def test_bloco_de_1h_nao_vira_diario(db_session):
    """O rollup soma só os blocos de 6 h: os de 1 h são a mesma venda numa granularidade mais
    fina, e somar os dois contaria duas vezes."""
    await save_market_history(
        async_session_maker, get_redis(), _payload([(ONTEM, 5, 50)], timescale=0), "west"
    )

    assert await _diario(db_session) == {}


async def test_outras_series_nao_sao_tocadas(db_session):
    """O recálculo é da série do upload. Um rollup completo apagaria estas linhas sem bloco; o do
    ingest não pode nem olhar para elas."""
    outras = [
        ("west", ITEM, "3005", 1),
        ("west", ITEM, "1002", 2),
        ("east", ITEM, "1002", 1),
        ("west", ITEM + 1, "1002", 1),
    ]
    for server_id, item_id, location_id, quality in outras:
        db_session.add(
            MarketHistoryDaily(
                server_id=server_id,
                item_id=item_id,
                location_id=location_id,
                quality_level=quality,
                dia=ONTEM.date(),
                item_amount=777,
                silver_amount=Decimal("777"),
                preco_medio=Decimal("1"),
            )
        )
    await db_session.commit()

    await save_market_history(async_session_maker, get_redis(), _payload([(ONTEM, 5, 50)]), "west")

    db_session.expire_all()
    intocadas = (
        await db_session.scalars(
            select(MarketHistoryDaily.item_amount).where(MarketHistoryDaily.item_amount == 777)
        )
    ).all()
    assert len(intocadas) == len(outras)
    assert (await _diario(db_session))[("west", "1002", 1, ONTEM.date())] == (5, Decimal("50"))


async def test_com_o_rollup_rodando_o_ingest_nao_espera(db_session):
    """O rollup segura o diário inteiro por ~80 s. O ingest não pode ficar preso nele nem entrar
    em deadlock: grava os blocos, pula o recálculo, e o próximo rollup cobre."""
    async with async_session_maker() as rollup:
        await tomar_lock_do_rollup(rollup)

        await asyncio.wait_for(
            save_market_history(
                async_session_maker, get_redis(), _payload([(ONTEM, 5, 50)]), "west"
            ),
            timeout=10,
        )

        entradas = await db_session.scalars(
            select(MarketHistoryEntry).where(MarketHistoryEntry.item_id == ITEM)
        )
        assert len(entradas.all()) == 1
        assert await _diario(db_session) == {}
        await rollup.rollback()


async def test_rollup_espera_o_ingest_que_esta_recalculando(db_session):
    """O outro lado do lock: com um ingest no meio da transação, o rollup só começa depois do
    commit dele — e aí enxerga os blocos que ele gravou."""
    async with async_session_maker() as ingest:
        assert await tentar_lock_do_ingest(ingest)

        rollup = asyncio.create_task(_rollup_diario(async_session_maker))
        await asyncio.sleep(0.5)
        assert not rollup.done()

        await ingest.commit()
        await asyncio.wait_for(rollup, timeout=10)
