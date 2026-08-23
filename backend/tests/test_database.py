"""Roda contra o Postgres efêmero do testcontainers (task 20, ver tests/conftest.py)."""

from sqlalchemy import text

from src.database import async_session_maker, engine


async def test_engine_connects():
    async with engine.connect():
        pass


async def test_get_session_runs_simple_query():
    async with async_session_maker() as session:
        result = await session.execute(text("SELECT 1"))
        assert result.scalar_one() == 1
