import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from src.cache.redis_client import get_redis, mget_book_depths, set_book_depth
from src.database import async_session_maker
from src.ingest.normalize import TICKS_PER_SECOND, TICKS_UNIX_EPOCH
from src.ingest.service import save_market_history, save_market_orders
from src.items.models import Item
from src.prices.models import MarketHistoryEntry, MarketOrder, MarketScan
from src.prices.service import get_item_prices
from tests.conftest import criar_usuario


def _orders_payload(item_id: str, source_id: int, wire_price: int) -> dict:
    expires = (datetime.now(timezone.utc) + timedelta(days=30)).replace(tzinfo=None).isoformat()
    return {
        "orders": [
            {
                "id": source_id,
                "item_id": item_id,
                "group_type_id": "",
                "location_id": "1002",
                "quality_level": 1,
                "enchantment_level": 0,
                "unit_price_silver": wire_price,
                "amount": 5,
                "auction_type": "offer",
                "expires": expires,
            }
        ]
    }


async def test_same_market_identity_is_isolated_by_server(db_session):
    item_id = f"T2_REALM_{uuid.uuid4().hex[:8]}"
    albion_id = 800_000_000 + uuid.uuid4().int % 100_000_000
    source_id = uuid.uuid4().int % 1_000_000_000
    user = await criar_usuario(db_session)
    db_session.add(Item(unique_name=item_id, albion_id=albion_id))
    await db_session.commit()

    await save_market_orders(
        async_session_maker,
        get_redis(),
        _orders_payload(item_id, source_id, 1_000_000),
        "west",
        str(user.id),
    )
    await save_market_orders(
        async_session_maker,
        get_redis(),
        _orders_payload(item_id, source_id, 2_000_000),
        "europe",
        str(user.id),
    )

    bucket = datetime.now(timezone.utc) - timedelta(hours=1)
    ticks = int(bucket.timestamp()) * TICKS_PER_SECOND + TICKS_UNIX_EPOCH
    history = {
        "albion_id": albion_id,
        "location_id": "1002",
        "quality_level": 1,
        "timescale": 0,
        "histories": [{"timestamp": ticks, "item_amount": 10, "silver_amount": 1_000_000}],
    }
    await save_market_history(async_session_maker, get_redis(), history, "west", str(user.id))
    await save_market_history(async_session_maker, get_redis(), history, "europe", str(user.id))

    orders = (
        await db_session.scalars(select(MarketOrder).where(MarketOrder.source_id == source_id))
    ).all()
    histories = (
        await db_session.scalars(
            select(MarketHistoryEntry).where(MarketHistoryEntry.item_id == albion_id)
        )
    ).all()
    scans = (
        await db_session.scalars(select(MarketScan).where(MarketScan.item_key == item_id))
    ).all()

    assert {(row.server_id, str(row.unit_price_silver)) for row in orders} == {
        ("west", "100.0000"),
        ("europe", "200.0000"),
    }
    assert {row.server_id for row in histories} == {"west", "europe"}
    assert {(row.server_id, row.fonte) for row in scans} == {
        ("west", "livro"),
        ("west", "historico"),
        ("europe", "livro"),
        ("europe", "historico"),
    }

    west = await get_item_prices(db_session, "west", item_id, "mine", user.id)
    europe = await get_item_prices(db_session, "europe", item_id, "mine", user.id)
    west_match = next(row for row in west["prices"] if row["location_id"] == "1002")
    europe_match = next(row for row in europe["prices"] if row["location_id"] == "1002")
    assert west_match["sell"]["best_price"] == "100.0000"
    assert europe_match["sell"]["best_price"] == "200.0000"


async def test_book_cache_keys_are_isolated_by_server():
    redis = get_redis()
    item_id = f"T2_CACHE_REALM_{uuid.uuid4().hex[:8]}"
    combo = [("1002", 1, 0)]
    await set_book_depth(redis, "west", item_id, "1002", 1, 0, {"value": "west"})
    await set_book_depth(redis, "east", item_id, "1002", 1, 0, {"value": "east"})

    west = await mget_book_depths(redis, "west", item_id, combo)
    east = await mget_book_depths(redis, "east", item_id, combo)
    assert west[combo[0]] == {"value": "west"}
    assert east[combo[0]] == {"value": "east"}
