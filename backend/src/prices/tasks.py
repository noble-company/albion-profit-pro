import asyncio
import time
from datetime import date, datetime, timedelta, timezone

import structlog
from sqlalchemy import Date, cast, delete, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import async_sessionmaker

from src.celery_app import celery_app
from src.database import create_worker_engine
from src.ingest.tasks import RETRYABLE_EXCEPTIONS
from src.prices.models import (
    MarketHistoryDaily,
    MarketHistoryEntry,
    MarketHistoryMonthly,
    MarketOrder,
)

log = structlog.get_logger()

# Política de retenção (task 31, decisão de produto) — grãos mais finos ficam pouco tempo
# porque o grão mais grosso já cobre o mesmo período (ver docs/tasks/backend/31-...).
RETENCAO_BUCKET_1H = timedelta(hours=48)
RETENCAO_BUCKET_6H = timedelta(days=90)
RETENCAO_DIARIO = timedelta(days=730)  # ~2 anos

# Dias sem nenhuma varredura reafirmar uma ordem antes de considerá-la morta, mesmo com
# `expires` no futuro — o jogo não manda evento de remoção quando um leilão é
# cancelado/comprado antes de expirar. Número não veio especificado na spec da task 31;
# default razoável, não uma decisão de produto validada com o usuário.
MARKET_ORDER_STALE_AFTER = timedelta(days=7)

# `rollup_diario` só recalcula essa janela a cada execução (roda de hora em hora) — pega
# bucket de 6h que ainda está parcial/crescendo sem precisar reescanear a tabela inteira.
ROLLUP_DIARIO_JANELA = timedelta(days=2)


def _run_periodic(nome: str, fn) -> None:
    """Mesmo padrão de `src.ingest.tasks._run_async` (task 23): engine/loop próprios por
    execução. Sem Redis aqui — rollup/poda só mexem no Postgres."""

    async def _wrapper() -> None:
        engine = create_worker_engine()
        sessionmaker = async_sessionmaker(engine, expire_on_commit=False)
        start = time.monotonic()
        try:
            await fn(sessionmaker)
        except RETRYABLE_EXCEPTIONS:
            log.warning("prices.erro_transitorio", job=nome, exc_info=True)
            raise
        except Exception:
            log.error("prices.erro_programacao", job=nome, exc_info=True)
            return
        else:
            duracao_ms = int((time.monotonic() - start) * 1000)
            log.info("prices.job_concluido", job=nome, duracao_ms=duracao_ms)
        finally:
            await engine.dispose()

    asyncio.run(_wrapper())


async def _rollup_diario(sessionmaker) -> None:
    """Agrega só os buckets de 6h (`bucket_seconds=21600`) por dia — os de 1h não entram
    aqui de propósito: são o mesmo giro real visto numa granularidade mais fina, e somar os
    dois contaria a mesma transação duas vezes. `preco_medio` é média ponderada por volume
    (sum(silver)/sum(amount)), nunca média das médias."""
    cutoff = datetime.now(timezone.utc) - ROLLUP_DIARIO_JANELA
    dia_expr = cast(MarketHistoryEntry.bucket_start, Date)

    async with sessionmaker() as session:
        stmt = (
            select(
                MarketHistoryEntry.item_id,
                MarketHistoryEntry.location_id,
                MarketHistoryEntry.quality_level,
                dia_expr.label("dia"),
                func.sum(MarketHistoryEntry.item_amount).label("item_amount"),
                func.sum(MarketHistoryEntry.silver_amount).label("silver_amount"),
            )
            .where(
                MarketHistoryEntry.bucket_seconds == 21600,
                MarketHistoryEntry.bucket_start >= cutoff,
            )
            .group_by(
                MarketHistoryEntry.item_id,
                MarketHistoryEntry.location_id,
                MarketHistoryEntry.quality_level,
                dia_expr,
            )
        )
        rows = (await session.execute(stmt)).all()
        if not rows:
            return

        values = [
            {
                "item_id": r.item_id,
                "location_id": r.location_id,
                "quality_level": r.quality_level,
                "dia": r.dia,
                "item_amount": int(r.item_amount),
                "silver_amount": r.silver_amount,
                "preco_medio": (r.silver_amount / r.item_amount) if r.item_amount else 0,
            }
            for r in rows
        ]
        stmt = pg_insert(MarketHistoryDaily).values(values)
        stmt = stmt.on_conflict_do_update(
            constraint="uq_market_history_daily",
            set_={
                "item_amount": stmt.excluded.item_amount,
                "silver_amount": stmt.excluded.silver_amount,
                "preco_medio": stmt.excluded.preco_medio,
            },
        )
        await session.execute(stmt)
        await session.commit()


def _primeiro_dia_do_mes(d: date) -> date:
    return d.replace(day=1)


async def _rollup_mensal(sessionmaker) -> None:
    """Agrega `market_history_daily` (não os buckets brutos) por mês — recalcula o mês
    corrente e o anterior, pra absorver dias que o rollup diário ainda estava terminando de
    fechar."""
    hoje = datetime.now(timezone.utc).date()
    mes_atual = _primeiro_dia_do_mes(hoje)
    mes_anterior = _primeiro_dia_do_mes(mes_atual - timedelta(days=1))
    mes_expr = cast(func.date_trunc("month", MarketHistoryDaily.dia), Date)

    async with sessionmaker() as session:
        stmt = (
            select(
                MarketHistoryDaily.item_id,
                MarketHistoryDaily.location_id,
                MarketHistoryDaily.quality_level,
                mes_expr.label("mes"),
                func.sum(MarketHistoryDaily.item_amount).label("item_amount"),
                func.sum(MarketHistoryDaily.silver_amount).label("silver_amount"),
            )
            .where(MarketHistoryDaily.dia >= mes_anterior)
            .group_by(
                MarketHistoryDaily.item_id,
                MarketHistoryDaily.location_id,
                MarketHistoryDaily.quality_level,
                mes_expr,
            )
        )
        rows = (await session.execute(stmt)).all()
        if not rows:
            return

        values = [
            {
                "item_id": r.item_id,
                "location_id": r.location_id,
                "quality_level": r.quality_level,
                "mes": r.mes,
                "item_amount": int(r.item_amount),
                "silver_amount": r.silver_amount,
                "preco_medio": (r.silver_amount / r.item_amount) if r.item_amount else 0,
            }
            for r in rows
        ]
        stmt = pg_insert(MarketHistoryMonthly).values(values)
        stmt = stmt.on_conflict_do_update(
            constraint="uq_market_history_monthly",
            set_={
                "item_amount": stmt.excluded.item_amount,
                "silver_amount": stmt.excluded.silver_amount,
                "preco_medio": stmt.excluded.preco_medio,
            },
        )
        await session.execute(stmt)
        await session.commit()


async def _poda(sessionmaker) -> None:
    """Apaga o que já saiu da retenção: buckets de 1h/6h fora da janela, dia fora da janela
    de 2 anos, ordens expiradas e ordens que ninguém mais varre há
    `MARKET_ORDER_STALE_AFTER`. Mensal não é podado (retenção indefinida, é a base de
    previsão)."""
    now = datetime.now(timezone.utc)
    async with sessionmaker() as session:
        await session.execute(
            delete(MarketHistoryEntry).where(
                MarketHistoryEntry.bucket_seconds == 3600,
                MarketHistoryEntry.bucket_start < now - RETENCAO_BUCKET_1H,
            )
        )
        await session.execute(
            delete(MarketHistoryEntry).where(
                MarketHistoryEntry.bucket_seconds == 21600,
                MarketHistoryEntry.bucket_start < now - RETENCAO_BUCKET_6H,
            )
        )
        await session.execute(
            delete(MarketHistoryDaily).where(
                MarketHistoryDaily.dia < (now - RETENCAO_DIARIO).date()
            )
        )
        await session.execute(delete(MarketOrder).where(MarketOrder.expires < now))
        await session.execute(
            delete(MarketOrder).where(MarketOrder.last_seen_at < now - MARKET_ORDER_STALE_AFTER)
        )
        await session.commit()


@celery_app.task(
    name="prices.rollup_diario",
    bind=True,
    autoretry_for=RETRYABLE_EXCEPTIONS,
    retry_backoff=True,
    retry_backoff_max=60,
    retry_jitter=True,
    max_retries=5,
)
def rollup_diario(self) -> None:
    _run_periodic("rollup_diario", _rollup_diario)


@celery_app.task(
    name="prices.rollup_mensal",
    bind=True,
    autoretry_for=RETRYABLE_EXCEPTIONS,
    retry_backoff=True,
    retry_backoff_max=60,
    retry_jitter=True,
    max_retries=5,
)
def rollup_mensal(self) -> None:
    _run_periodic("rollup_mensal", _rollup_mensal)


@celery_app.task(
    name="prices.poda",
    bind=True,
    autoretry_for=RETRYABLE_EXCEPTIONS,
    retry_backoff=True,
    retry_backoff_max=60,
    retry_jitter=True,
    max_retries=5,
)
def poda(self) -> None:
    _run_periodic("poda", _poda)
