import asyncio
import time
from collections.abc import Awaitable, Callable

import structlog
from sqlalchemy.ext.asyncio import async_sessionmaker

from src.cache.redis_client import new_redis_client
from src.celery_app import celery_app
from src.database import create_worker_engine
from src.ingest.service import save_market_history, save_market_orders
from src.quarantine.task_base import QuarantinableTask
from src.tasking import RETRYABLE_EXCEPTIONS

log = structlog.get_logger()


def _run_async(
    topico: str,
    user_id: str,
    server_id: str,
    n_itens: int,
    fn: Callable[[async_sessionmaker, object], Awaitable[None]],
) -> None:
    """Executa o ingest num loop próprio e descarta todos os recursos no mesmo loop.

    Falhas transitórias sobem para o retry do Celery; as demais terminam em FAILURE e seguem para
    a quarentena durável.
    """

    async def _wrapper() -> None:
        engine = create_worker_engine()
        sessionmaker = async_sessionmaker(engine, expire_on_commit=False)
        redis = new_redis_client()
        start = time.monotonic()
        try:
            await fn(sessionmaker, redis)
        except RETRYABLE_EXCEPTIONS:
            log.warning(
                "ingest.erro_transitorio",
                topico=topico,
                user_id=user_id,
                server_id=server_id,
                exc_info=True,
            )
            raise
        except Exception:
            log.error(
                "ingest.erro_programacao",
                topico=topico,
                user_id=user_id,
                server_id=server_id,
                exc_info=True,
            )
            raise
        else:
            duracao_ms = int((time.monotonic() - start) * 1000)
            log.info(
                "ingest.gravado",
                topico=topico,
                user_id=user_id,
                server_id=server_id,
                n_itens=n_itens,
                duracao_ms=duracao_ms,
            )
        finally:
            await redis.aclose()
            await engine.dispose()

    asyncio.run(_wrapper())


@celery_app.task(
    name="ingest.process_market_orders",
    base=QuarantinableTask,
    bind=True,
    autoretry_for=RETRYABLE_EXCEPTIONS,
    retry_backoff=True,
    retry_backoff_max=60,
    retry_jitter=True,
    max_retries=5,
)
def process_market_orders(
    self,
    payload: dict,
    user_id: str,
    realm: str,
    api_token_id: str | None = None,
) -> None:
    _run_async(
        "marketorders",
        user_id,
        realm,
        len(payload["orders"]),
        lambda sessionmaker, redis: save_market_orders(
            sessionmaker, redis, payload, realm, user_id
        ),
    )


@celery_app.task(
    name="ingest.process_market_history",
    base=QuarantinableTask,
    bind=True,
    autoretry_for=RETRYABLE_EXCEPTIONS,
    retry_backoff=True,
    retry_backoff_max=60,
    retry_jitter=True,
    max_retries=5,
)
def process_market_history(
    self,
    payload: dict,
    user_id: str,
    realm: str,
    api_token_id: str | None = None,
) -> None:
    _run_async(
        "markethistories",
        user_id,
        realm,
        len(payload["histories"]),
        lambda sessionmaker, redis: save_market_history(
            sessionmaker, redis, payload, realm, user_id
        ),
    )


@celery_app.task(name="ingest.process_gold_prices", base=QuarantinableTask, bind=True)
def process_gold_prices(
    self,
    payload: dict,
    user_id: str,
    realm: str,
    api_token_id: str | None = None,
) -> None:
    """Gold price fica fora de escopo até ser priorizado (decisão do usuário, 2026-08-22) —
    implementação completa depende de criar o Modelo GoldPrice (mesma forma de
    MarketHistoryEntry). Até lá, o client recebe 200 (não é erro dele), mas o descarte fica
    registrado para manter o descarte observável."""
    log.warning(
        "ingest.descartado",
        topico="goldprices",
        user_id=user_id,
        server_id=realm,
        motivo="fora de escopo",
        n_pontos=len(payload["prices"]),
    )


process_market_orders.failure_kind = "ingest"
process_market_orders.failure_topic = "marketorders"
process_market_history.failure_kind = "ingest"
process_market_history.failure_topic = "markethistories"
process_gold_prices.failure_kind = "ingest"
process_gold_prices.failure_topic = "goldprices"
