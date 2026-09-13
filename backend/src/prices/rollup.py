"""Rollup diário de `market_history_entry` (task 31, dividido na 4/29).

A fórmula mora aqui, e não em `tasks.py`, porque tem dois donos: o rollup de hora em hora, que
reconstrói a janela inteira, e o ingest do client, que recalcula só a série que acabou de chegar
(achado `W11`: o volume por dia chegava à tela até 2 h depois do upload). Os dois gravam a mesma
conta.
"""

from collections.abc import Iterable
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import BigInteger, Date, case, cast, func, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.prices.models import MarketHistoryDaily, MarketHistoryEntry

RETENCAO_BUCKET_6H = timedelta(days=90)

# Só os blocos de 6 h entram no diário: os de 1 h são o mesmo giro visto numa granularidade mais
# fina, e somar os dois contaria a mesma transação duas vezes.
BUCKET_DO_DIARIO = 21600

# O rollup completo apaga e reinsere a janela numa transação de ~80 s. O ingest não pode esperar
# por ela nem disputar as mesmas linhas em outra ordem (deadlock): o rollup toma o lock exclusivo,
# o ingest tenta o compartilhado e desiste na hora.
LOCK_DO_ROLLUP_DIARIO = "prices.rollup_diario"


def utc_now(now: datetime | None = None) -> datetime:
    value = now or datetime.now(timezone.utc)
    if value.tzinfo is None:
        raise ValueError("now precisa ter timezone")
    return value.astimezone(timezone.utc)


def _utc_day_start(value: datetime) -> datetime:
    return value.replace(hour=0, minute=0, second=0, microsecond=0)


def daily_repair_bounds(now: datetime | None = None) -> tuple[datetime, datetime, datetime]:
    """Retorna (início a limpar, primeiro dia reconstruível, fim exclusivo).

    A retenção de 90 dias é móvel e preserva hora/minuto. O dia que contém seu cutoff pode
    já ter perdido buckets, portanto é removido dos derivados mas não reconstruído. O dia
    corrente também é removido e fica fora do rollup até fechar em UTC.
    """
    current = utc_now(now)
    raw_cutoff = current - RETENCAO_BUCKET_6H
    cleanup_start = _utc_day_start(raw_cutoff)
    complete_start = cleanup_start
    if raw_cutoff > cleanup_start:
        complete_start += timedelta(days=1)
    return cleanup_start, complete_start, _utc_day_start(current)


async def tomar_lock_do_rollup(session: AsyncSession) -> None:
    """Exclusivo, até o fim da transação. Espera os ingests que estão no meio de um recálculo."""
    await session.execute(
        text("SELECT pg_advisory_xact_lock(hashtext(:nome))"), {"nome": LOCK_DO_ROLLUP_DIARIO}
    )


async def tentar_lock_do_ingest(session: AsyncSession) -> bool:
    """Compartilhado, até o fim da transação, sem esperar. `False` quando o rollup está rodando
    ou já na fila do lock."""
    return bool(
        await session.scalar(
            text("SELECT pg_try_advisory_xact_lock_shared(hashtext(:nome))"),
            {"nome": LOCK_DO_ROLLUP_DIARIO},
        )
    )


def inserir_diario(*filtros):
    """`INSERT ... SELECT ... GROUP BY` do diário sobre os blocos de 6 h que passam em `filtros`.

    Uma instrução, agregada no banco. O `INSERT ... VALUES` com uma linha de parâmetros por dia
    agregado parou em 4.095 linhas: 8 colunas por linha passam do limite de 32.767 parâmetros do
    asyncpg (achado `W8`). `preco_medio` é média ponderada por volume, nunca média das médias.
    """
    dia_expr = cast(MarketHistoryEntry.bucket_start, Date)
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
        .where(MarketHistoryEntry.bucket_seconds == BUCKET_DO_DIARIO, *filtros)
        .group_by(
            MarketHistoryEntry.server_id,
            MarketHistoryEntry.item_id,
            MarketHistoryEntry.location_id,
            MarketHistoryEntry.quality_level,
            dia_expr,
        )
    )
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
    return stmt.on_conflict_do_update(
        constraint="uq_market_history_daily",
        set_={
            "item_amount": stmt.excluded.item_amount,
            "silver_amount": stmt.excluded.silver_amount,
            "preco_medio": stmt.excluded.preco_medio,
        },
    )


async def recalcular_diario_da_serie(
    session: AsyncSession,
    *,
    server_id: str,
    item_id: int,
    location_id: str,
    quality_level: int,
    dias: Iterable[date],
    now: datetime | None = None,
) -> int:
    """Recalcula o diário de uma série só nos `dias` pedidos. Não faz commit.

    Os limites são os do rollup: dia UTC completo e inteiro dentro da retenção — fora disso o
    rollup não reconstrói, e a linha gravada aqui sumiria na hora seguinte. A soma relê todos os
    blocos do dia, de qualquer fonte. Devolve quantos dias recalculou.
    """
    _, primeiro, fim = daily_repair_bounds(now)
    dias = sorted({dia for dia in dias if primeiro.date() <= dia < fim.date()})
    if not dias:
        return 0

    inicio = datetime.combine(dias[0], time.min, tzinfo=timezone.utc)
    ate = datetime.combine(dias[-1], time.min, tzinfo=timezone.utc) + timedelta(days=1)
    await session.execute(
        inserir_diario(
            MarketHistoryEntry.server_id == server_id,
            MarketHistoryEntry.item_id == item_id,
            MarketHistoryEntry.location_id == location_id,
            MarketHistoryEntry.quality_level == quality_level,
            # A faixa usa o índice da série; o `IN` deixa de fora os dias do meio não tocados.
            MarketHistoryEntry.bucket_start >= inicio,
            MarketHistoryEntry.bucket_start < ate,
            cast(MarketHistoryEntry.bucket_start, Date).in_(dias),
        )
    )
    return len(dias)
