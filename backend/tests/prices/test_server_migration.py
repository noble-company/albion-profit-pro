import asyncio
import uuid
from pathlib import Path

from alembic.config import Config
from sqlalchemy import text

from alembic import command
from src.database import async_session_maker


async def test_realm_migration_backfills_confirmed_legacy_as_west():
    """Exercita a rota de produção: schema anterior com fato real -> migration de realm."""
    config = Config(str(Path(__file__).resolve().parent.parent.parent / "alembic.ini"))
    loop = asyncio.get_running_loop()
    source_id = uuid.uuid4().int % 1_000_000_000

    try:
        await loop.run_in_executor(None, command.downgrade, config, "b7e2d3f4a5c6")
        async with async_session_maker() as session:
            await session.execute(
                text(
                    """
                    INSERT INTO market_order (
                        id, source_id, item_id, group_type_id, location_id, quality_level,
                        enchantment_level, unit_price_silver, amount, auction_type, expires
                    ) VALUES (
                        :id, :source_id, 'T2_LEGACY_REALM', '', '1002', 1,
                        0, 100, 1, 'offer', now() + interval '1 day'
                    )
                    """
                ),
                {"id": uuid.uuid4(), "source_id": source_id},
            )
            await session.commit()

        await loop.run_in_executor(None, command.upgrade, config, "head")
        async with async_session_maker() as session:
            server_id = await session.scalar(
                text("SELECT server_id FROM market_order WHERE source_id = :source_id"),
                {"source_id": source_id},
            )
        assert server_id == "west"
    finally:
        await loop.run_in_executor(None, command.upgrade, config, "head")
