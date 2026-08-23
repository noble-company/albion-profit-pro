import asyncio
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from src.database import async_session_maker, engine
from src.prices.models import MarketHistoryEntry, MarketOrder, MarketScan
from tests.conftest import criar_usuario


async def test_market_order_constraint_rejects_invalid_auction_type(db_session):
    invalid = MarketOrder(
        server_id="west",
        source_id=991_001,
        item_id="T2_FIBER",
        group_type_id="",
        location_id="1002",
        quality_level=1,
        enchantment_level=0,
        unit_price_silver=Decimal("10"),
        amount=1,
        auction_type="sell",
        expires=datetime.now(timezone.utc) + timedelta(days=30),
    )
    with pytest.raises(IntegrityError):
        async with db_session.begin_nested():
            db_session.add(invalid)
            await db_session.flush()


async def test_market_history_constraint_rejects_negative_amount(db_session):
    invalid = MarketHistoryEntry(
        server_id="west",
        item_id=1020,
        location_id="1002",
        quality_level=1,
        bucket_seconds=21600,
        bucket_start=datetime.now(timezone.utc),
        item_amount=-1,
        silver_amount=Decimal("0"),
    )
    with pytest.raises(IntegrityError):
        async with db_session.begin_nested():
            db_session.add(invalid)
            await db_session.flush()


async def test_market_scan_constraint_rejects_unknown_source(db_session):
    user = await criar_usuario(db_session)
    await db_session.commit()
    invalid = MarketScan(
        server_id="west",
        user_id=user.id,
        item_key="T2_FIBER",
        location_id="1002",
        quality_level=1,
        fonte="crawler",
    )
    with pytest.raises(IntegrityError):
        async with db_session.begin_nested():
            db_session.add(invalid)
            await db_session.flush()


async def test_contract_migration_roundtrip_and_constraints_present():
    from alembic.config import Config

    from alembic import command

    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    loop = asyncio.get_running_loop()
    try:
        await loop.run_in_executor(None, command.downgrade, config, "c8f3e4a5b6d7")
        async with async_session_maker() as session:
            count = await session.scalar(
                text(
                    "SELECT count(*) FROM pg_constraint "
                    "WHERE conname = 'ck_market_order_auction_type'"
                )
            )
            assert count == 0

        await loop.run_in_executor(None, command.upgrade, config, "head")
        async with async_session_maker() as session:
            names = set(
                await session.scalars(
                    text(
                        "SELECT conname FROM pg_constraint "
                        "WHERE conname LIKE 'ck_market_order_%' "
                        "OR conname LIKE 'ck_market_history_entry_%' "
                        "OR conname LIKE 'ck_market_scan_%'"
                    )
                )
            )
        assert "ck_market_order_auction_type" in names
        assert "ck_market_history_entry_amount_nonnegative" in names
        assert "ck_market_scan_fonte" in names
    finally:
        await loop.run_in_executor(None, command.upgrade, config, "head")
        await engine.dispose()
