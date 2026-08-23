import asyncio
import time
from collections.abc import Awaitable, Callable

import structlog
from redis.exceptions import ConnectionError as RedisConnectionError
from sqlalchemy.exc import InterfaceError, OperationalError
from sqlalchemy.ext.asyncio import async_sessionmaker

from src.cache.redis_client import new_redis_client
from src.celery_app import celery_app
from src.database import create_worker_engine
from src.ingest.service import save_market_history, save_market_orders

log = structlog.get_logger()

RETRYABLE_EXCEPTIONS = (
    OperationalError,
    InterfaceError,
    RedisConnectionError,
    ConnectionError,  # builtin: conexão recusada/resetada no connect() cru, antes do asyncpg
    # embrulhar em OperationalError (medido ao derrubar o Postgres de propósito, task 24)
)


def _run_async(
    topico: str,
    user_id: str,
    n_itens: int,
    fn: Callable[[async_sessionmaker, object], Awaitable[None]],
) -> None:
    """Executa a logica async da task num loop proprio, criando e destruindo engine/Redis
    dentro dele (task 23). Loga inicio/fim/falha da task — erro transitorio de Postgres/Redis
    sobe pro autoretry_for do Celery (task 24); erro de programacao (payload mal-formado,
    bug) e logado e descartado sem retry, porque retentar nao conserta, so multiplica o log
    (ver docs/04-revisao-fase-1.md, achado A5)."""

    async def _wrapper() -> None:
        engine = create_worker_engine()
        sessionmaker = async_sessionmaker(engine, expire_on_commit=False)
        redis = new_redis_client()
        start = time.monotonic()
        try:
            await fn(sessionmaker, redis)
        except RETRYABLE_EXCEPTIONS:
            log.warning("ingest.erro_transitorio", topico=topico, user_id=user_id, exc_info=True)
            raise
        except Exception:
            log.error("ingest.erro_programacao", topico=topico, user_id=user_id, exc_info=True)
            return
        else:
            duracao_ms = int((time.monotonic() - start) * 1000)
            log.info(
                "ingest.gravado",
                topico=topico,
                user_id=user_id,
                n_itens=n_itens,
                duracao_ms=duracao_ms,
            )
        finally:
            await redis.aclose()
            await engine.dispose()

    asyncio.run(_wrapper())


@celery_app.task(
    name="ingest.process_market_orders",
    bind=True,
    autoretry_for=RETRYABLE_EXCEPTIONS,
    retry_backoff=True,
    retry_backoff_max=60,
    retry_jitter=True,
    max_retries=5,
)
def process_market_orders(self, payload: dict, user_id: str) -> None:
    _run_async(
        "marketorders",
        user_id,
        len(payload["orders"]),
        lambda sessionmaker, redis: save_market_orders(sessionmaker, redis, payload, user_id),
    )


@celery_app.task(
    name="ingest.process_market_history",
    bind=True,
    autoretry_for=RETRYABLE_EXCEPTIONS,
    retry_backoff=True,
    retry_backoff_max=60,
    retry_jitter=True,
    max_retries=5,
)
def process_market_history(self, payload: dict, user_id: str) -> None:
    _run_async(
        "markethistories",
        user_id,
        len(payload["histories"]),
        lambda sessionmaker, redis: save_market_history(sessionmaker, redis, payload, user_id),
    )


@celery_app.task(name="ingest.process_gold_prices")
def process_gold_prices(payload: dict, user_id: str) -> None:
    """Gold price fica fora de escopo até ser priorizado (decisão do usuário, 2026-08-22) —
    implementação completa depende de criar o Modelo GoldPrice (mesma forma de
    MarketHistoryEntry). Até lá, o client recebe 200 (não é erro dele), mas o descarte fica
    registrado — não é mais silencioso (ver docs/04-revisao-fase-1.md, achado C6)."""
    log.warning(
        "ingest.descartado",
        topico="goldprices",
        user_id=user_id,
        motivo="fora de escopo",
        n_pontos=len(payload["prices"]),
    )
