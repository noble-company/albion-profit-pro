"""Reconstrução periódica do ranking de produção materializado (``B02``).

Roda na fila ``maintenance``. O beat dispara a cada 10 min; a janela aceitável de
obsolescência é ``RANKING_STALENESS_LIMIT`` (15 min) — depois disso o payload marca ``stale``.
"""

import asyncio
import time

import structlog
from sqlalchemy.ext.asyncio import async_sessionmaker

from src.celery_app import celery_app
from src.database import create_worker_engine
from src.opportunities.ranking_service import rebuild_ranking
from src.prices.constants import AlbionServer
from src.quarantine.task_base import QuarantinableTask
from src.tasking import RETRYABLE_EXCEPTIONS

log = structlog.get_logger()


async def _rebuild_all_realms() -> None:
    engine = create_worker_engine()
    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)
    start = time.monotonic()
    try:
        for server in AlbionServer:
            async with sessionmaker() as session:
                await rebuild_ranking(session, server.value)
    except RETRYABLE_EXCEPTIONS:
        log.warning("opportunities.ranking_erro_transitorio", exc_info=True)
        raise
    except Exception:
        log.error("opportunities.ranking_erro_programacao", exc_info=True)
        raise
    else:
        log.info(
            "opportunities.ranking_job_concluido",
            duracao_ms=int((time.monotonic() - start) * 1000),
        )
    finally:
        await engine.dispose()


@celery_app.task(
    name="opportunities.rebuild_recipe_ranking",
    base=QuarantinableTask,
    bind=True,
    autoretry_for=RETRYABLE_EXCEPTIONS,
    retry_backoff=True,
    retry_backoff_max=60,
    retry_jitter=True,
    max_retries=5,
)
def rebuild_recipe_ranking(self) -> None:
    asyncio.run(_rebuild_all_realms())
