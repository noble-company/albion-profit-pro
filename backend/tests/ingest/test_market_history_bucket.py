"""
Cobertura da task 26 — `market_history_entry` como tabela-fato global e idempotente.
Chama `save_market_history` direto (não `.delay()`), mesmo motivo documentado em
tests/ingest/test_tasks.py (asyncio.run() dentro de loop já rodando).
"""

from decimal import Decimal

from sqlalchemy import select

from src.cache.redis_client import get_redis
from src.database import async_session_maker
from src.ingest.normalize import BUCKET_POR_TIMESCALE
from src.ingest.schemas import MarketHistoriesUploadIn
from src.ingest.service import save_market_history
from src.prices.models import MarketHistoryEntry


def _dump(payload_historico_real: dict) -> dict:
    return MarketHistoriesUploadIn.model_validate(payload_historico_real).model_dump(by_alias=False)


def test_bucket_por_timescale_mapping():
    """Timescale=0 é bucket de 1h; Timescale=1 e 2 colapsam no mesmo bucket de 6h — são a
    mesma série em janelas diferentes, não granularidades diferentes (achado N2)."""
    assert BUCKET_POR_TIMESCALE[0] == 3600
    assert BUCKET_POR_TIMESCALE[1] == 21600
    assert BUCKET_POR_TIMESCALE[2] == 21600


async def test_real_fixture_writes_with_bucket_seconds_from_timescale(
    payload_historico_real, db_session
):
    payload = _dump(payload_historico_real)
    item_id = payload["albion_id"]

    await save_market_history(async_session_maker, get_redis(), payload)

    result = await db_session.execute(
        select(MarketHistoryEntry).where(MarketHistoryEntry.item_id == item_id)
    )
    rows = result.scalars().all()
    assert len(rows) == len(payload["histories"])
    assert all(r.bucket_seconds == 21600 for r in rows)


async def test_reprocessing_same_payload_is_idempotent(payload_historico_real, db_session):
    payload = _dump(payload_historico_real)
    item_id = payload["albion_id"]

    await save_market_history(async_session_maker, get_redis(), payload)
    await save_market_history(async_session_maker, get_redis(), payload)  # reprocessar não duplica

    result = await db_session.execute(
        select(MarketHistoryEntry).where(MarketHistoryEntry.item_id == item_id)
    )
    rows = result.scalars().all()
    assert len(rows) == len(payload["histories"])


async def test_timescale_1_and_2_collapse_into_the_same_rows(payload_historico_real, db_session):
    """Prova o N2: um payload Timescale=1 com um subconjunto dos MESMOS pontos (mesmo
    Timestamp/ItemAmount/SilverAmount) de um Timescale=2 grava a UNIÃO das linhas, não a soma —
    é o mesmo bucket_seconds (21600) e o mesmo bucket_start, então cai na mesma linha."""
    ts2_payload = _dump(payload_historico_real)
    item_id = ts2_payload["albion_id"]
    subset = ts2_payload["histories"][:5]
    ts1_payload = {**ts2_payload, "timescale": 1, "histories": subset}

    await save_market_history(async_session_maker, get_redis(), ts1_payload)
    await save_market_history(async_session_maker, get_redis(), ts2_payload)

    result = await db_session.execute(
        select(MarketHistoryEntry).where(MarketHistoryEntry.item_id == item_id)
    )
    rows = result.scalars().all()
    assert len(rows) == len(ts2_payload["histories"])  # união, não soma


async def test_on_conflict_do_update_corrects_partial_bucket_through_task(
    payload_historico_real, db_session
):
    """O bucket corrente é parcial — reenviar o mesmo bucket com item_amount maior atualiza a
    linha em vez de descartar (era o achado da task 17 corrigido aqui: DO UPDATE, não DO
    NOTHING)."""
    ts2_payload = _dump(payload_historico_real)
    item_id = ts2_payload["albion_id"]
    point = ts2_payload["histories"][0]
    small = {**ts2_payload, "histories": [{**point, "item_amount": 10, "silver_amount": 1000}]}
    big = {
        **ts2_payload,
        "histories": [{**point, "item_amount": 99999, "silver_amount": 999990000}],
    }

    await save_market_history(async_session_maker, get_redis(), small)
    await save_market_history(async_session_maker, get_redis(), big)

    result = await db_session.execute(
        select(MarketHistoryEntry).where(MarketHistoryEntry.item_id == item_id)
    )
    rows = result.scalars().all()
    assert len(rows) == 1
    assert rows[0].item_amount == 99999
    assert rows[0].silver_amount == Decimal("99999")


async def test_intra_batch_duplicate_bucket_does_not_raise(payload_historico_real, db_session):
    """Os timestamps não vêm ordenados e um payload pode repetir o mesmo bucket — o Postgres
    recusaria um ON CONFLICT batendo na mesma linha duas vezes no mesmo INSERT se não
    deduplicássemos antes. Último valor do lote vence."""
    ts2_payload = _dump(payload_historico_real)
    item_id = ts2_payload["albion_id"]
    point = ts2_payload["histories"][0]
    payload = {
        **ts2_payload,
        "histories": [
            {**point, "item_amount": 1},
            {**point, "item_amount": 2},  # mesmo Timestamp -> mesmo bucket_start
        ],
    }

    await save_market_history(async_session_maker, get_redis(), payload)  # não pode levantar

    result = await db_session.execute(
        select(MarketHistoryEntry).where(MarketHistoryEntry.item_id == item_id)
    )
    rows = result.scalars().all()
    assert len(rows) == 1
    assert rows[0].item_amount == 2  # último do lote venceu
