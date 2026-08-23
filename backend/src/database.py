from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool

from src.config import get_settings

settings = get_settings()

engine = create_async_engine(settings.database_url, pool_pre_ping=True)
async_session_maker = async_sessionmaker(engine, expire_on_commit=False)


def create_worker_engine():
    """Engine de vida curta pro worker Celery: cada task roda no seu proprio event loop
    (asyncio.run), entao conexoes NAO podem ser reaproveitadas entre tasks. NullPool
    garante que nada sobrevive ao fim do loop. application_name identifica essas conexoes
    em pg_stat_activity (ver tests/ingest/test_tasks_lifecycle.py)."""
    return create_async_engine(
        settings.database_url,
        poolclass=NullPool,
        connect_args={"server_settings": {"application_name": "albion-profit-pro-worker"}},
    )


class Base(DeclarativeBase):
    pass


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_maker() as session:
        yield session
