"""
Cobertura da task 30 — `market_scan` registra procedência por usuário sem duplicar a
tabela-fato: uma linha por (usuário, item, local, qualidade, fonte), `n_varreduras` sobe a
cada reenvio da mesma combinação em vez de multiplicar linhas.
"""

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from src.cache.redis_client import get_redis
from src.database import async_session_maker
from src.ingest.normalize import TICKS_PER_SECOND, TICKS_UNIX_EPOCH
from src.ingest.service import save_market_history, save_market_orders
from src.items.models import Item
from src.prices.constants import MarketScanSource
from src.prices.models import MarketScan
from tests.conftest import criar_usuario


def _unique_item_id() -> str:
    return f"T2_TESTITEM_{uuid.uuid4().hex[:8]}"


async def test_resending_same_scan_upserts_instead_of_duplicating(db_session):
    """2 ingests do mesmo usuário/combinação (fonte "livro") -> 1 linha em market_scan,
    n_varreduras == 2."""
    user = await criar_usuario(db_session)
    await db_session.commit()
    item_id = _unique_item_id()
    future_expires = (
        (datetime.now(timezone.utc) + timedelta(days=30)).replace(tzinfo=None).isoformat()
    )
    payload = {
        "orders": [
            {
                "id": uuid.uuid4().int % 1_000_000_000,
                "item_id": item_id,
                "group_type_id": "",
                "location_id": "1002",
                "quality_level": 1,
                "enchantment_level": 0,
                "unit_price_silver": 1000000,
                "amount": 50,
                "auction_type": "offer",
                "expires": future_expires,
            }
        ]
    }

    await save_market_orders(async_session_maker, get_redis(), payload, "west", str(user.id))
    await save_market_orders(async_session_maker, get_redis(), payload, "west", str(user.id))

    result = await db_session.execute(select(MarketScan).where(MarketScan.item_key == item_id))
    rows = result.scalars().all()
    assert len(rows) == 1  # não duplicou — upsert
    assert rows[0].n_varreduras == 2
    assert rows[0].fonte == MarketScanSource.BOOK
    assert rows[0].user_id == user.id
    assert rows[0].location_id == "1002"
    assert rows[0].quality_level == 1


async def test_market_history_scan_resolves_unique_name_via_item_table(db_session):
    """Fonte "historico": `market_scan.item_key` é o unique_name resolvido a partir do
    AlbionId via `item` (task 28), não o AlbionId cru."""
    user = await criar_usuario(db_session)
    unique_name = f"ZZSCAN_{uuid.uuid4().hex[:8]}"
    albion_id = 970000 + (uuid.uuid4().int % 9999)
    db_session.add(Item(unique_name=unique_name, albion_id=albion_id))
    await db_session.commit()

    bucket_start = datetime(2026, 8, 21, 18, tzinfo=timezone.utc)
    ticks = int(bucket_start.timestamp()) * TICKS_PER_SECOND + TICKS_UNIX_EPOCH
    payload = {
        "albion_id": albion_id,
        "location_id": "1002",
        "quality_level": 1,
        "timescale": 2,
        "histories": [
            {
                "timestamp": ticks,
                "item_amount": 10,
                "silver_amount": 100000,
            }
        ],
    }

    await save_market_history(async_session_maker, get_redis(), payload, "west", str(user.id))

    result = await db_session.execute(select(MarketScan).where(MarketScan.item_key == unique_name))
    rows = result.scalars().all()
    assert len(rows) == 1
    assert rows[0].fonte == MarketScanSource.HISTORY
    assert rows[0].user_id == user.id
    assert rows[0].location_id == "1002"
    assert rows[0].quality_level == 1
