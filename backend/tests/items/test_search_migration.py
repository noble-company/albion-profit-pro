import asyncio
from pathlib import Path

from alembic.config import Config
from sqlalchemy import text

from alembic import command
from src.database import async_session_maker


async def test_search_migration_backfills_existing_catalog():
    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    loop = asyncio.get_running_loop()

    try:
        await loop.run_in_executor(None, command.downgrade, config, "e0b5c6d7e8f9")
        async with async_session_maker() as session, session.begin():
            await session.execute(
                text(
                    "INSERT INTO item "
                    "(unique_name, name_pt, name_en, enchantment_level) "
                    "VALUES ('ZZ_MIGRATION_COTTON', 'Algodão', 'Cotton', 0)"
                )
            )

        await loop.run_in_executor(None, command.upgrade, config, "head")
        async with async_session_maker() as session:
            normalized = await session.scalar(
                text("SELECT busca_normalizada FROM item WHERE unique_name = 'ZZ_MIGRATION_COTTON'")
            )
            nullable = await session.scalar(
                text(
                    "SELECT is_nullable FROM information_schema.columns "
                    "WHERE table_name = 'item' AND column_name = 'busca_normalizada'"
                )
            )
        assert normalized == "zz_migration_cotton algodao cotton"
        assert nullable == "NO"
    finally:
        await loop.run_in_executor(None, command.upgrade, config, "head")
