import asyncio
import time
from datetime import date, datetime, timedelta, timezone

import httpx
import structlog
from sqlalchemy import BigInteger, Date, case, cast, delete, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import async_sessionmaker

from src.celery_app import celery_app
from src.config import get_settings
from src.database import create_worker_engine
from src.prices import aodp
from src.prices.models import (
    MarketHistoryDaily,
    MarketHistoryEntry,
    MarketHistoryMonthly,
    MarketOrder,
)
from src.prices.snapshot import upsert_snapshot
from src.quarantine.task_base import QuarantinableTask
from src.recipes.models import Recipe, RecipeIngredient
from src.tasking import RETRYABLE_EXCEPTIONS

log = structlog.get_logger()

# Política de retenção: grãos mais finos ficam pouco tempo
# porque o grão mais grosso já cobre o mesmo período (ver docs/tasks/backend/31-...).
RETENCAO_BUCKET_1H = timedelta(hours=48)
RETENCAO_BUCKET_6H = timedelta(days=90)
RETENCAO_DIARIO = timedelta(days=730)  # ~2 anos

# Dias sem nenhuma varredura reafirmar uma ordem antes de considerá-la morta, mesmo com
# `expires` no futuro — o jogo não manda evento de remoção quando um leilão é
# cancelado/comprado antes de expirar. A janela conservadora ainda precisa de validação de produto.
MARKET_ORDER_STALE_AFTER = timedelta(days=7)


def _run_periodic(nome: str, fn) -> None:
    """Mesmo padrão de `src.ingest.tasks._run_async`: engine/loop próprios por
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
            raise
        else:
            duracao_ms = int((time.monotonic() - start) * 1000)
            log.info("prices.job_concluido", job=nome, duracao_ms=duracao_ms)
        finally:
            await engine.dispose()

    asyncio.run(_wrapper())


def _utc_now(now: datetime | None = None) -> datetime:
    value = now or datetime.now(timezone.utc)
    if value.tzinfo is None:
        raise ValueError("now precisa ter timezone")
    return value.astimezone(timezone.utc)


def _utc_day_start(value: datetime) -> datetime:
    return value.replace(hour=0, minute=0, second=0, microsecond=0)


def _daily_repair_bounds(now: datetime | None = None) -> tuple[datetime, datetime, datetime]:
    """Retorna (início a limpar, primeiro dia reconstruível, fim exclusivo).

    A retenção de 90 dias é móvel e preserva hora/minuto. O dia que contém seu cutoff pode
    já ter perdido buckets, portanto é removido dos derivados mas não reconstruído. O dia
    corrente também é removido e fica fora do rollup até fechar em UTC.
    """
    current = _utc_now(now)
    raw_cutoff = current - RETENCAO_BUCKET_6H
    cleanup_start = _utc_day_start(raw_cutoff)
    complete_start = cleanup_start
    if raw_cutoff > cleanup_start:
        complete_start += timedelta(days=1)
    return cleanup_start, complete_start, _utc_day_start(current)


async def _rollup_diario(sessionmaker, now: datetime | None = None) -> tuple[date, date]:
    """Agrega só os buckets de 6h (`bucket_seconds=21600`) por dia — os de 1h não entram
    aqui de propósito: são o mesmo giro real visto numa granularidade mais fina, e somar os
    dois contaria a mesma transação duas vezes. Só reconstrói dias UTC completos cuja fonte
    bruta ainda está integralmente retida; o dia corrente e o dia parcial na borda são
    removidos dos derivados. `preco_medio` é média ponderada por volume."""
    cleanup_start, complete_start, end = _daily_repair_bounds(now)
    dia_expr = cast(MarketHistoryEntry.bucket_start, Date)

    async with sessionmaker() as session:
        # DELETE + rebuild dentro da mesma transação também corrige derivados que ficaram
        # órfãos após reparos/remoções no bruto. O dia da borda e o corrente são apagados,
        # mas apenas os dias comprovadamente completos voltam a ser inseridos.
        await session.execute(
            delete(MarketHistoryDaily).where(
                MarketHistoryDaily.dia >= cleanup_start.date(),
                MarketHistoryDaily.dia <= end.date(),
            )
        )
        soma_itens = func.sum(MarketHistoryEntry.item_amount)
        soma_prata = func.sum(MarketHistoryEntry.silver_amount)
        agregado = (
            select(
                func.gen_random_uuid(),
                MarketHistoryEntry.server_id,
                MarketHistoryEntry.item_id,
                MarketHistoryEntry.location_id,
                MarketHistoryEntry.quality_level,
                dia_expr,
                cast(soma_itens, BigInteger),
                soma_prata,
                case((soma_itens == 0, 0), else_=soma_prata / soma_itens),
            )
            .where(
                MarketHistoryEntry.bucket_seconds == 21600,
                MarketHistoryEntry.bucket_start >= complete_start,
                MarketHistoryEntry.bucket_start < end,
            )
            .group_by(
                MarketHistoryEntry.server_id,
                MarketHistoryEntry.item_id,
                MarketHistoryEntry.location_id,
                MarketHistoryEntry.quality_level,
                dia_expr,
            )
        )
        # Uma instrução, agregada no banco. O `INSERT ... VALUES` com uma linha de parâmetros por
        # dia agregado parou em 4.095 linhas: 8 colunas por linha passam do limite de 32.767
        # parâmetros do asyncpg, e o histórico local já pedia 11.210 (achado de 2026-09-10).
        stmt = pg_insert(MarketHistoryDaily).from_select(
            [
                "id",
                "server_id",
                "item_id",
                "location_id",
                "quality_level",
                "dia",
                "item_amount",
                "silver_amount",
                "preco_medio",
            ],
            agregado,
        )
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
    return cleanup_start.date(), end.date()


def _primeiro_dia_do_mes(d: date) -> date:
    return d.replace(day=1)


async def _rollup_mensal(
    sessionmaker,
    repair_start: date | None = None,
    end: date | None = None,
    now: datetime | None = None,
) -> None:
    """Reconstrói os meses afetados depois que os diários foram reparados.

    O primeiro mês inclui diários anteriores à janela bruta que ainda estejam preservados;
    assim uma janela de 90 dias começando no meio do mês não sobrescreve o mensal com apenas
    o pedaço recente desse mês. `end` é exclusivo e normalmente representa hoje em UTC.
    """
    current = _utc_now(now)
    if repair_start is None or end is None:
        repair_start, _, repair_end = _daily_repair_bounds(current)
        repair_start = repair_start.date()
        end = repair_end.date()
    month_start = _primeiro_dia_do_mes(repair_start)
    last_month = _primeiro_dia_do_mes(end)
    mes_expr = cast(func.date_trunc("month", MarketHistoryDaily.dia), Date)

    async with sessionmaker() as session:
        await session.execute(
            delete(MarketHistoryMonthly).where(
                MarketHistoryMonthly.mes >= month_start,
                MarketHistoryMonthly.mes <= last_month,
            )
        )
        soma_itens = func.sum(MarketHistoryDaily.item_amount)
        soma_prata = func.sum(MarketHistoryDaily.silver_amount)
        agregado = (
            select(
                func.gen_random_uuid(),
                MarketHistoryDaily.server_id,
                MarketHistoryDaily.item_id,
                MarketHistoryDaily.location_id,
                MarketHistoryDaily.quality_level,
                mes_expr,
                cast(soma_itens, BigInteger),
                soma_prata,
                case((soma_itens == 0, 0), else_=soma_prata / soma_itens),
            )
            .where(
                MarketHistoryDaily.dia >= month_start,
                MarketHistoryDaily.dia < end,
            )
            .group_by(
                MarketHistoryDaily.server_id,
                MarketHistoryDaily.item_id,
                MarketHistoryDaily.location_id,
                MarketHistoryDaily.quality_level,
                mes_expr,
            )
        )
        # Mesma instrução única do diário, e pelo mesmo motivo: o mensal herda o volume dele.
        stmt = pg_insert(MarketHistoryMonthly).from_select(
            [
                "id",
                "server_id",
                "item_id",
                "location_id",
                "quality_level",
                "mes",
                "item_amount",
                "silver_amount",
                "preco_medio",
            ],
            agregado,
        )
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


async def _repair_rollups(sessionmaker, now: datetime | None = None) -> None:
    """Ordem obrigatória: diário autoritativo primeiro, mensal derivado depois."""
    current = _utc_now(now)
    repair_start, end = await _rollup_diario(sessionmaker, current)
    await _rollup_mensal(sessionmaker, repair_start, end, current)


async def _poda(sessionmaker, now: datetime | None = None) -> None:
    """Apaga o que já saiu da retenção: buckets de 1h/6h fora da janela, dia fora da janela
    de 2 anos, ordens expiradas e ordens que ninguém mais varre há
    `MARKET_ORDER_STALE_AFTER`. Mensal não é podado (retenção indefinida, é a base de
    previsão)."""
    now = _utc_now(now)
    raw_6h_cutoff, _, _ = _daily_repair_bounds(now)
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
                # Retenção alinhada à meia-noite: nunca deixa o primeiro dia do recorte
                # pela metade. Esse dia inteiro funciona como folga; o reparo começa no
                # seguinte e a poda só o remove quando sair integralmente da janela.
                MarketHistoryEntry.bucket_start < raw_6h_cutoff,
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


async def _repair_then_prune(sessionmaker, now: datetime | None = None) -> None:
    """Nunca remove bruto antes de confirmar que diário e mensal foram reconstruídos."""
    current = _utc_now(now)
    await _repair_rollups(sessionmaker, current)
    await _poda(sessionmaker, current)


@celery_app.task(
    name="prices.rollup_diario",
    base=QuarantinableTask,
    bind=True,
    autoretry_for=RETRYABLE_EXCEPTIONS,
    retry_backoff=True,
    retry_backoff_max=60,
    retry_jitter=True,
    max_retries=5,
)
def rollup_diario(self) -> None:
    _run_periodic("rollup_diario", _repair_rollups)


@celery_app.task(
    name="prices.rollup_mensal",
    base=QuarantinableTask,
    bind=True,
    autoretry_for=RETRYABLE_EXCEPTIONS,
    retry_backoff=True,
    retry_backoff_max=60,
    retry_jitter=True,
    max_retries=5,
)
def rollup_mensal(self) -> None:
    # Mantida para operação/replay de tarefas antigas, mas também repara o diário primeiro.
    _run_periodic("rollup_mensal", _repair_rollups)


@celery_app.task(
    name="prices.poda",
    base=QuarantinableTask,
    bind=True,
    autoretry_for=RETRYABLE_EXCEPTIONS,
    retry_backoff=True,
    retry_backoff_max=60,
    retry_jitter=True,
    max_retries=5,
)
def poda(self) -> None:
    _run_periodic("poda", _repair_then_prune)


rollup_diario.failure_kind = "maintenance"
rollup_diario.failure_topic = "rollup_diario"
rollup_mensal.failure_kind = "maintenance"
rollup_mensal.failure_topic = "rollup_mensal"
poda.failure_kind = "maintenance"
poda.failure_topic = "poda"


# --- Poller da API pública (task 4/04, achado `X06`) ---


async def _itens_para_cotar(session) -> list[str]:
    """Todo item que o scanner precisa precificar: saída de receita + ingrediente.

    Sai do catálogo, não de `market_order`. Puxar só o que já tem preço seria reproduzir o
    `X01` na camada de coleta — o item nunca observado continuaria nunca sendo observado.
    """
    saidas = select(Recipe.output_item_unique_name.label("item"))
    ingredientes = select(RecipeIngredient.ingredient_unique_name.label("item"))
    linhas = await session.scalars(saidas.union(ingredientes))
    return sorted(set(linhas.all()))


async def _sync_aodp_realm(sessionmaker, realm: str) -> dict:
    settings = get_settings()
    base_url = aodp.base_url_for(realm, settings.aodp_base_url_template)

    async with sessionmaker() as session:
        itens = await _itens_para_cotar(session)

    lotes = aodp.build_batches(itens, base_url=base_url)
    total_linhas = falhas = 0

    async with httpx.AsyncClient() as client:
        for indice, lote in enumerate(lotes):
            try:
                cru = await aodp.fetch_prices(client, base_url, lote)
            except (httpx.HTTPError, ValueError):
                # Um lote que falha não pode derrubar os outros: indisponibilidade de um
                # terceiro não invalida o trabalho já feito nem trava a fila.
                falhas += 1
                log.warning("aodp.lote_falhou", realm=realm, lote=indice, exc_info=True)
                continue

            linhas = aodp.to_snapshot_rows(cru)
            if not linhas:
                continue
            async with sessionmaker() as session:
                await upsert_snapshot(session, realm, linhas)
                await session.commit()
            total_linhas += len(linhas)

    resumo = {
        "realm": realm,
        "itens": len(itens),
        "lotes": len(lotes),
        "linhas": total_linhas,
        "lotes_com_falha": falhas,
    }
    log.info("aodp.realm_sincronizado", **resumo)
    return resumo


async def _sync_aodp(sessionmaker) -> None:
    settings = get_settings()
    if not settings.aodp_enabled:
        log.info("aodp.desligado")
        return
    for realm in settings.aodp_realms:
        await _sync_aodp_realm(sessionmaker, realm)


@celery_app.task(
    name="prices.sync_aodp",
    base=QuarantinableTask,
    bind=True,
    autoretry_for=RETRYABLE_EXCEPTIONS,
    retry_backoff=True,
    retry_backoff_max=60,
    retry_jitter=True,
    max_retries=3,
)
def sync_aodp(self) -> None:
    _run_periodic("sync_aodp", _sync_aodp)
