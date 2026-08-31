import asyncio
import uuid
from pathlib import Path

from alembic.config import Config
from sqlalchemy import text

from alembic import command
from src.database import async_session_maker


async def test_position_migration_backfills_populated_recipes():
    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    loop = asyncio.get_running_loop()
    recipe_id = uuid.uuid4()

    try:
        await loop.run_in_executor(None, command.downgrade, config, "f1c6d7e8f9a0")
        async with async_session_maker() as session, session.begin():
            await session.execute(
                text(
                    "INSERT INTO recipe "
                    "(id, output_item_unique_name, enchantment_level, silver_cost, "
                    "crafting_focus, amount_crafted, craft_time) "
                    "VALUES (:id, 'ZZ_MIGRATION_RECIPE', 0, 0, 0, 1, 0)"
                ),
                {"id": recipe_id},
            )
            await session.execute(
                text(
                    "INSERT INTO recipe_ingredient "
                    "(id, recipe_id, ingredient_unique_name, count, enchantment_level) VALUES "
                    "(:z_id, :recipe_id, 'ZZ_Z_INGREDIENT', 1, 0), "
                    "(:a_id, :recipe_id, 'ZZ_A_INGREDIENT', 1, 0)"
                ),
                {"z_id": uuid.uuid4(), "a_id": uuid.uuid4(), "recipe_id": recipe_id},
            )

        await loop.run_in_executor(None, command.upgrade, config, "head")
        async with async_session_maker() as session:
            rows = await session.execute(
                text(
                    "SELECT ingredient_unique_name, position FROM recipe_ingredient "
                    "WHERE recipe_id = :recipe_id ORDER BY position"
                ),
                {"recipe_id": recipe_id},
            )
            nullable = await session.scalar(
                text(
                    "SELECT is_nullable FROM information_schema.columns "
                    "WHERE table_name = 'recipe_ingredient' AND column_name = 'position'"
                )
            )
            default = await session.scalar(
                text(
                    "SELECT column_default FROM information_schema.columns "
                    "WHERE table_name = 'recipe_ingredient' AND column_name = 'position'"
                )
            )
            constraints = set(
                await session.scalars(
                    text(
                        "SELECT conname FROM pg_constraint "
                        "WHERE conrelid = 'recipe_ingredient'::regclass "
                        "AND conname IN "
                        "('ck_recipe_ingredient_position_nonnegative', "
                        "'uq_recipe_ingredient_position')"
                    )
                )
            )

        assert list(rows) == [("ZZ_A_INGREDIENT", 0), ("ZZ_Z_INGREDIENT", 1)]
        assert nullable == "NO"
        assert default is None
        assert constraints == {
            "ck_recipe_ingredient_position_nonnegative",
            "uq_recipe_ingredient_position",
        }
    finally:
        await loop.run_in_executor(None, command.upgrade, config, "head")
