import asyncio
import time
from datetime import date, datetime, timedelta

import httpx
import structlog
from sqlalchemy import BigInteger, Date, case, cast, delete, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import async_sessionmaker

from src.cache.redis_client import new_redis_client
from src.celery_app import celery_app
from src.config import get_settings
from src.database import create_worker_engine
from src.items.models import Item
from src.prices import aodp
from src.prices.history import upsert_history_aodp
from src.prices.models import (
    MarketHistoryDaily,
    MarketHistoryEntry,
    MarketHistoryMonthly,
    MarketOrder,
)
from src.prices.rollup import (
    daily_repair_bounds,
    inserir_diario,
    tomar_lock_do_rollup,
    utc_now,
)
from src.prices.snapshot import upsert_snapshot
from src.quarantine.task_base import QuarantinableTask
from src.recipes.models import Recipe, RecipeIngredient
from src.tasking import RETRYABLE_EXCEPTIONS

log = structlog.get_logger()

# Política de retenção: grãos mais finos ficam pouco tempo
# porque o grão mais grosso já cobre o mesmo período (ver docs/tasks/backend/31-...).
RETENCAO_BUCKET_1H = timedelta(hours=48)
# A de 6 h (90 dias) mora em `src/prices/rollup.py`: o ingest também respeita a janela dela.
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


async def _rollup_diario(sessionmaker, now: datetime | None = None) -> tuple[date, date]:
    """Agrega só os buckets de 6h (`bucket_seconds=21600`) por dia — os de 1h não entram
    aqui de propósito: são o mesmo giro real visto numa granularidade mais fina, e somar os
    dois contaria a mesma transação duas vezes. Só reconstrói dias UTC completos cuja fonte
    bruta ainda está integralmente retida; o dia corrente e o dia parcial na borda são
    removidos dos derivados. `preco_medio` é média ponderada por volume.

    O ingest recalcula a série que acabou de chegar sem esperar esta rodada (task 4/29); o lock
    exclusivo garante que as duas escritas nunca se cruzam."""
    cleanup_start, complete_start, end = daily_repair_bounds(now)

    async with sessionmaker() as session:
        # Antes do DELETE: espera o ingest que está no meio de um recálculo, e os blocos que ele
        # gravou já aparecem para o SELECT abaixo.
        await tomar_lock_do_rollup(session)
        # DELETE + rebuild dentro da mesma transação também corrige derivados que ficaram
        # órfãos após reparos/remoções no bruto. O dia da borda e o corrente são apagados,
        # mas apenas os dias comprovadamente completos voltam a ser inseridos.
        await session.execute(
            delete(MarketHistoryDaily).where(
                MarketHistoryDaily.dia >= cleanup_start.date(),
                MarketHistoryDaily.dia <= end.date(),
            )
        )
        await session.execute(
            inserir_diario(
                MarketHistoryEntry.bucket_start >= complete_start,
                MarketHistoryEntry.bucket_start < end,
            )
        )
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
    current = utc_now(now)
    if repair_start is None or end is None:
        repair_start, _, repair_end = daily_repair_bounds(current)
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
    current = utc_now(now)
    repair_start, end = await _rollup_diario(sessionmaker, current)
    await _rollup_mensal(sessionmaker, repair_start, end, current)


async def _poda(sessionmaker, now: datetime | None = None) -> None:
    """Apaga o que já saiu da retenção: buckets de 1h/6h fora da janela, dia fora da janela
    de 2 anos, ordens expiradas e ordens que ninguém mais varre há
    `MARKET_ORDER_STALE_AFTER`. Mensal não é podado (retenção indefinida, é a base de
    previsão)."""
    now = utc_now(now)
    raw_6h_cutoff, _, _ = daily_repair_bounds(now)
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
    current = utc_now(now)
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


# --- Histórico da API pública (task 4/23) ---

# Itens por pedido. A resposta traz até 8 cidades × 5 qualidades × 120 blocos por item; com 50
# itens cada resposta fica em poucos MB mesmo na primeira varredura, a dos 30 dias.
AODP_HISTORY_LOTE = 50
# Pedidos por execução do beat (a cada 10 min). Com a pausa abaixo é ~1 min de trabalho: longe dos
# 180 req/min e 300 req/5 min da API, e sem segurar a fila de manutenção.
AODP_HISTORY_LOTES_POR_EXECUCAO = 20
AODP_HISTORY_PAUSA_SEGUNDOS = 2.0
# O histórico só muda a cada 6 h (os blocos do jogo): uma varredura por bloco.
AODP_HISTORY_INTERVALO = timedelta(hours=6)
# A primeira varredura traz o que a API tem (~30 dias); as seguintes, só o fim — com folga para o
# bloco que ainda estava aberto na anterior. Medido: 38,8 KB contra 3,9 KB no mesmo lote.
AODP_HISTORY_DIAS_INICIAIS = 30
AODP_HISTORY_DIAS_INCREMENTAIS = 3


def chave_do_historico(realm: str) -> str:
    """Onde mora a posição da varredura. Redis é descartável aqui de propósito: sem a chave, a
    varredura só recomeça do início — nenhum dado se perde, porque o dado mora no Postgres."""
    return f"aodp:historico:{realm}"


async def _albion_ids(session, itens: list[str]) -> dict[str, int]:
    linhas = await session.execute(
        select(Item.unique_name, Item.albion_id).where(
            Item.unique_name.in_(itens), Item.albion_id.is_not(None)
        )
    )
    return {nome: albion_id for nome, albion_id in linhas.all()}


async def _sync_aodp_history_realm(
    sessionmaker, redis, realm: str, now: datetime | None = None, *, pausa: float = 0.0
) -> dict:
    """Uma fatia da varredura do histórico de um realm.

    O estado vive numa hash do Redis: `cursor` (o próximo lote), `desde` (a data inicial da
    varredura em andamento) e `iniciada_em`. Ao terminar, sobra só `ultima_iniciada_em`, que decide
    quando a próxima começa — 6 h depois do início da anterior.
    """
    agora = utc_now(now)
    chave = chave_do_historico(realm)
    estado = await redis.hgetall(chave)

    if "cursor" not in estado:
        ultima = estado.get("ultima_iniciada_em")
        if ultima and agora - datetime.fromisoformat(ultima) < AODP_HISTORY_INTERVALO:
            return {"realm": realm, "status": "aguardando"}
        dias = AODP_HISTORY_DIAS_INCREMENTAIS if ultima else AODP_HISTORY_DIAS_INICIAIS
        estado = {
            "cursor": "0",
            "desde": (agora - timedelta(days=dias)).date().isoformat(),
            "iniciada_em": agora.isoformat(),
        }
        await redis.hset(chave, mapping=estado)

    cursor = int(estado["cursor"])
    desde = date.fromisoformat(estado["desde"])

    async with sessionmaker() as session:
        itens = await _itens_para_cotar(session)
        albion_ids = await _albion_ids(session, itens)
    # Sem `albion_id` não há onde gravar: a tabela é chaveada por ele.
    itens = [item for item in itens if item in albion_ids]
    lotes = [itens[i : i + AODP_HISTORY_LOTE] for i in range(0, len(itens), AODP_HISTORY_LOTE)]
    fatia = lotes[cursor : cursor + AODP_HISTORY_LOTES_POR_EXECUCAO]

    base_url = aodp.base_url_for(realm, get_settings().aodp_base_url_template)
    linhas_gravadas = falhas = 0
    async with httpx.AsyncClient() as client:
        for indice, lote in enumerate(fatia):
            if indice and pausa:
                await asyncio.sleep(pausa)
            try:
                cru = await aodp.fetch_history(client, base_url, lote, desde)
            except (httpx.HTTPError, ValueError):
                # Um lote que falha não derruba os outros nem trava a varredura: ele volta na
                # próxima, 6 h depois.
                falhas += 1
                log.warning(
                    "aodp.historico_lote_falhou", realm=realm, lote=cursor + indice, exc_info=True
                )
                continue

            linhas = aodp.to_history_rows(cru, albion_ids)
            if not linhas:
                continue
            async with sessionmaker() as session:
                await upsert_history_aodp(session, realm, linhas)
                await session.commit()
            linhas_gravadas += len(linhas)

    novo_cursor = cursor + len(fatia)
    if novo_cursor >= len(lotes):
        await redis.delete(chave)
        await redis.hset(chave, mapping={"ultima_iniciada_em": estado["iniciada_em"]})
        status = "concluida"
    else:
        await redis.hset(chave, "cursor", str(novo_cursor))
        status = "continuando"

    resumo = {
        "realm": realm,
        "status": status,
        "desde": desde.isoformat(),
        "lotes_processados": len(fatia),
        "lotes_totais": len(lotes),
        "lotes_com_falha": falhas,
        "linhas": linhas_gravadas,
    }
    log.info("aodp.historico_sincronizado", **resumo)
    return resumo


async def _sync_aodp_history(sessionmaker) -> None:
    settings = get_settings()
    if not settings.aodp_enabled:
        log.info("aodp.desligado")
        return
    # Cliente novo por execução: o worker roda cada task num `asyncio.run` próprio, e o cliente
    # global ficaria preso ao loop da execução anterior.
    redis = new_redis_client()
    try:
        for realm in settings.aodp_realms:
            await _sync_aodp_history_realm(
                sessionmaker, redis, realm, pausa=AODP_HISTORY_PAUSA_SEGUNDOS
            )
    finally:
        await redis.aclose()


@celery_app.task(
    name="prices.sync_aodp_history",
    base=QuarantinableTask,
    bind=True,
    autoretry_for=RETRYABLE_EXCEPTIONS,
    retry_backoff=True,
    retry_backoff_max=60,
    retry_jitter=True,
    max_retries=3,
)
def sync_aodp_history(self) -> None:
    _run_periodic("sync_aodp_history", _sync_aodp_history)
