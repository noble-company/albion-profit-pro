import asyncio

from sqlalchemy.ext.asyncio import async_sessionmaker

from src.celery_app import celery_app
from src.database import create_worker_engine
from src.quarantine.service import persist_failure
from src.tasking import RETRYABLE_EXCEPTIONS


async def _persist_failure(failure: dict) -> None:
    engine = create_worker_engine()
    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)
    try:
        await persist_failure(sessionmaker, failure)
    finally:
        await engine.dispose()


@celery_app.task(
    name="quarantine.persist_task_failure",
    bind=True,
    autoretry_for=RETRYABLE_EXCEPTIONS,
    retry_backoff=True,
    retry_backoff_max=60,
    retry_jitter=True,
    max_retries=None,
)
def persist_task_failure(self, failure: dict) -> None:
    """Persistência terminal; não usa QuarantinableTask para nunca quarentenar a si mesma."""
    asyncio.run(_persist_failure(failure))
