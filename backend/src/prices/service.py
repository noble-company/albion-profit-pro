import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import and_, exists, func, literal, select, tuple_
from sqlalchemy.dialects.postgresql import aggregate_order_by
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.engine import Row
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from src.cache.redis_client import (
    delete_book_depth,
    get_redis,
    mget_book_depths,
    set_book_depth,
)
from src.items.models import Item
from src.prices.constants import MarketScanSource
from src.prices.models import MarketHistoryEntry, MarketOrder, MarketScan
from src.prices.policy import MarketBookPolicy, get_market_book_policy

LATEST_OBSERVATION_TOLERANCE = timedelta(seconds=5)


@dataclass(frozen=True, slots=True)
class ExecutableBookLevel:
    item_id: str
    location_id: str
    quality_level: int
    enchantment_level: int
    auction_type: str
    unit_price: Decimal
    amount: int
    latest_seen_at: datetime


def latest_order_observation_filter():
    """Restrict a MarketOrder query to the newest observation for each book side.

    The client sends a batch of orders in one transaction, so PostgreSQL assigns the same
    ``last_seen_at`` to all rows in that observation. Grouping by the complete market identity
    and auction side prevents a newer price from being mixed with an older order that was already
    sold or replaced. This is a read projection; task 20.4 may add explicit empty-snapshot
    reconciliation later.
    """
    newest = aliased(MarketOrder)
    latest_seen = (
        select(func.max(newest.last_seen_at))
        .where(
            newest.server_id == MarketOrder.server_id,
            newest.item_id == MarketOrder.item_id,
            newest.location_id == MarketOrder.location_id,
            newest.quality_level == MarketOrder.quality_level,
            newest.enchantment_level == MarketOrder.enchantment_level,
            newest.auction_type == MarketOrder.auction_type,
        )
        .correlate(MarketOrder)
        .scalar_subquery()
    )
    # A single ingest transaction normally gives every row the exact same PostgreSQL
    # transaction timestamp. The small tolerance also keeps rows from the same response when
    # fixtures or alternate producers provide per-row timestamps a few microseconds apart.
    return MarketOrder.last_seen_at >= latest_seen - LATEST_OBSERVATION_TOLERANCE


def _observation_age_seconds(observed_at: datetime | None, now: datetime) -> int | None:
    if observed_at is None:
        return None
    return max(0, int((now - observed_at).total_seconds()))


def _build_side(
    best_price,
    observed_units,
    observed_orders,
    observed_at: datetime | None,
    now: datetime,
) -> dict:
    return {
        "best_price": str(best_price) if best_price is not None else None,
        "observed_units": int(observed_units or 0),
        "observed_orders": int(observed_orders or 0),
        "observed_at": observed_at.isoformat() if observed_at is not None else None,
        "age_seconds": _observation_age_seconds(observed_at, now),
    }


def _empty_side(now: datetime) -> dict:
    return _build_side(None, 0, 0, None, now)


def _build_book_payload(
    row: Row | None,
    turnover: dict | None,
    policy: MarketBookPolicy | None = None,
    now: datetime | None = None,
    sources: dict[str, bool] | None = None,
) -> dict:
    policy = policy or get_market_book_policy()
    now = now or datetime.now(timezone.utc)
    if row is not None:
        sell = _build_side(
            row.menor_venda,
            row.venda_unidades,
            row.venda_qtd,
            row.venda_observada_em,
            now,
        )
        buy = _build_side(
            row.maior_compra,
            row.compra_unidades,
            row.compra_qtd,
            row.compra_observada_em,
            now,
        )
    else:
        sell = _empty_side(now)
        buy = _empty_side(now)

    sold_24h = None
    if turnover is not None:
        sold_24h = {
            "units": turnover["units"],
            "average_price": str(turnover["average_price"])
            if turnover["average_price"] is not None
            else None,
        }

    return {
        "sell": sell,
        "buy": buy,
        "sold_24h": sold_24h,
        "coverage": policy.coverage,
        "freshness_window_seconds": policy.freshness_seconds,
        "sources": sources or {"book": row is not None, "history": turnover is not None},
        "updated_at": now.isoformat(),
    }


def _refresh_cached_ages(payload: dict, now: datetime) -> dict:
    """Refresh the derived age without touching the authoritative observed instant in the cache."""
    for side_name in ("sell", "buy"):
        side = payload[side_name]
        observed_raw = side.get("observed_at")
        observed_at = datetime.fromisoformat(observed_raw) if observed_raw else None
        side["age_seconds"] = _observation_age_seconds(observed_at, now)
    return payload


def _scan_exists_for_order(server_id: str, user_id: uuid.UUID):
    return exists(
        select(MarketScan.id).where(
            MarketScan.user_id == user_id,
            MarketScan.server_id == server_id,
            MarketScan.item_key == MarketOrder.item_id,
            MarketScan.location_id == MarketOrder.location_id,
            MarketScan.quality_level == MarketOrder.quality_level,
            MarketScan.fonte == MarketScanSource.BOOK,
        )
    )


def _scan_exists_for_history(server_id: str, user_id: uuid.UUID):
    return exists(
        select(MarketScan.id).where(
            MarketScan.user_id == user_id,
            MarketScan.server_id == server_id,
            MarketScan.item_key == Item.unique_name,
            MarketScan.location_id == MarketHistoryEntry.location_id,
            MarketScan.quality_level == MarketHistoryEntry.quality_level,
            MarketScan.fonte == MarketScanSource.HISTORY,
        )
    )


async def query_item_combinations(
    session: AsyncSession,
    server_id: str,
    item_id: str,
    user_id: uuid.UUID | None = None,
    location_ids: list[str] | None = None,
    quality_level: int | None = None,
    enchantment_level: int | None = None,
    limit: int = 100,
    offset: int = 0,
) -> tuple[list[tuple[str, int, int, bool, bool]], int]:
    """Lista somente combinações realmente observadas, com paginação no Postgres.

    Os filtros de qualidade/encantamento entram ANTES da contagem e da paginação (F08): o
    ``total`` reflete o conjunto filtrado, e uma página não aparece vazia por conta de um
    filtro aplicado depois do corte.
    """
    book = select(
        MarketOrder.location_id.label("location_id"),
        MarketOrder.quality_level.label("quality_level"),
        MarketOrder.enchantment_level.label("enchantment_level"),
        literal(True).label("has_book"),
        literal(False).label("has_history"),
    ).where(MarketOrder.server_id == server_id, MarketOrder.item_id == item_id)
    if user_id is not None:
        book = book.where(_scan_exists_for_order(server_id, user_id))
    if location_ids:
        book = book.where(MarketOrder.location_id.in_(location_ids))

    history = (
        select(
            MarketHistoryEntry.location_id.label("location_id"),
            MarketHistoryEntry.quality_level.label("quality_level"),
            Item.enchantment_level.label("enchantment_level"),
            literal(False).label("has_book"),
            literal(True).label("has_history"),
        )
        .select_from(MarketHistoryEntry)
        .join(Item, Item.albion_id == MarketHistoryEntry.item_id)
        .where(MarketHistoryEntry.server_id == server_id, Item.unique_name == item_id)
    )
    if user_id is not None:
        history = history.where(_scan_exists_for_history(server_id, user_id))
    if location_ids:
        history = history.where(MarketHistoryEntry.location_id.in_(location_ids))

    observations = book.union_all(history).cte("item_observations")
    grouped = (
        select(
            observations.c.location_id,
            observations.c.quality_level,
            observations.c.enchantment_level,
            func.bool_or(observations.c.has_book).label("has_book"),
            func.bool_or(observations.c.has_history).label("has_history"),
        )
        .group_by(
            observations.c.location_id,
            observations.c.quality_level,
            observations.c.enchantment_level,
        )
        .cte("item_combinations")
    )
    combo_filters = []
    if quality_level is not None:
        combo_filters.append(grouped.c.quality_level == quality_level)
    if enchantment_level is not None:
        combo_filters.append(grouped.c.enchantment_level == enchantment_level)
    combinations = select(grouped).where(*combo_filters).cte("filtered_item_combinations")

    total = int((await session.scalar(select(func.count()).select_from(combinations))) or 0)
    stmt = (
        select(
            combinations.c.location_id,
            combinations.c.quality_level,
            combinations.c.enchantment_level,
            combinations.c.has_book,
            combinations.c.has_history,
        )
        .order_by(
            combinations.c.location_id,
            combinations.c.quality_level,
            combinations.c.enchantment_level,
        )
        .limit(limit)
        .offset(offset)
    )
    rows = await session.execute(stmt)
    return [
        (
            r.location_id,
            r.quality_level,
            r.enchantment_level,
            r.has_book,
            r.has_history,
        )
        for r in rows
    ], total


async def query_book_depth(
    session: AsyncSession,
    server_id: str,
    combos: list[tuple[str, str, int, int]],
    freshness_hours: int,
    user_id: uuid.UUID | None = None,
) -> dict[tuple[str, str, int, int], Row]:
    """Agrega somente ordens frescas e não expiradas nas combinações solicitadas.

    A observação é calculada por lado. `user_id` restringe as combinações às varreduras do
    usuário; os valores continuam vindo do acervo global.
    """
    if not combos:
        return {}

    cutoff = datetime.now(timezone.utc) - timedelta(hours=freshness_hours)
    is_fresh = and_(MarketOrder.expires > func.now(), MarketOrder.last_seen_at > cutoff)
    is_offer = MarketOrder.auction_type == "offer"
    is_request = MarketOrder.auction_type == "request"

    stmt = (
        select(
            MarketOrder.item_id,
            MarketOrder.location_id,
            MarketOrder.quality_level,
            MarketOrder.enchantment_level,
            func.min(MarketOrder.unit_price_silver).filter(is_fresh, is_offer).label("menor_venda"),
            func.sum(MarketOrder.amount).filter(is_fresh, is_offer).label("venda_unidades"),
            func.count().filter(is_fresh, is_offer).label("venda_qtd"),
            func.array_agg(
                aggregate_order_by(
                    MarketOrder.last_seen_at,
                    MarketOrder.unit_price_silver.asc(),
                    MarketOrder.last_seen_at.desc(),
                )
            )
            .filter(is_fresh, is_offer)[1]
            .label("venda_observada_em"),
            func.max(MarketOrder.unit_price_silver)
            .filter(is_fresh, is_request)
            .label("maior_compra"),
            func.sum(MarketOrder.amount).filter(is_fresh, is_request).label("compra_unidades"),
            func.count().filter(is_fresh, is_request).label("compra_qtd"),
            func.array_agg(
                aggregate_order_by(
                    MarketOrder.last_seen_at,
                    MarketOrder.unit_price_silver.desc(),
                    MarketOrder.last_seen_at.desc(),
                )
            )
            .filter(is_fresh, is_request)[1]
            .label("compra_observada_em"),
        )
        .where(
            MarketOrder.server_id == server_id,
            latest_order_observation_filter(),
            tuple_(
                MarketOrder.item_id,
                MarketOrder.location_id,
                MarketOrder.quality_level,
                MarketOrder.enchantment_level,
            ).in_(combos),
        )
        .group_by(
            MarketOrder.item_id,
            MarketOrder.location_id,
            MarketOrder.quality_level,
            MarketOrder.enchantment_level,
        )
    )
    if user_id is not None:
        stmt = stmt.where(_scan_exists_for_order(server_id, user_id))
    result = await session.execute(stmt)
    return {(r.item_id, r.location_id, r.quality_level, r.enchantment_level): r for r in result}


async def query_executable_book_levels(
    session: AsyncSession,
    server_id: str,
    combos: list[tuple[str, str, int, int]],
    freshness_hours: int,
) -> list[ExecutableBookLevel]:
    """Load executable price levels for all requested combinations in one query.

    Expired orders are excluded. Stale active levels are retained with ``amount=0`` so callers
    can distinguish ``stale_data`` from a side that has never had a price. Orders at the same
    price are aggregated, but only fresh quantities contribute to an executable fill.
    """

    if not combos:
        return []

    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=freshness_hours)
    fresh_amount = func.sum(MarketOrder.amount).filter(MarketOrder.last_seen_at > cutoff)
    stmt = (
        select(
            MarketOrder.item_id,
            MarketOrder.location_id,
            MarketOrder.quality_level,
            MarketOrder.enchantment_level,
            MarketOrder.auction_type,
            MarketOrder.unit_price_silver,
            fresh_amount.label("fresh_amount"),
            func.max(MarketOrder.last_seen_at).label("latest_seen_at"),
        )
        .where(
            MarketOrder.server_id == server_id,
            latest_order_observation_filter(),
            MarketOrder.expires > now,
            tuple_(
                MarketOrder.item_id,
                MarketOrder.location_id,
                MarketOrder.quality_level,
                MarketOrder.enchantment_level,
            ).in_(combos),
        )
        .group_by(
            MarketOrder.item_id,
            MarketOrder.location_id,
            MarketOrder.quality_level,
            MarketOrder.enchantment_level,
            MarketOrder.auction_type,
            MarketOrder.unit_price_silver,
        )
    )
    rows = await session.execute(stmt)
    return [
        ExecutableBookLevel(
            item_id=row.item_id,
            location_id=row.location_id,
            quality_level=row.quality_level,
            enchantment_level=row.enchantment_level,
            auction_type=row.auction_type,
            unit_price=row.unit_price_silver,
            amount=int(row.fresh_amount or 0),
            latest_seen_at=row.latest_seen_at,
        )
        for row in rows
    ]


async def query_book_coverage(
    session: AsyncSession,
    server_id: str,
    combos: list[tuple[str, str, int, int]],
    user_id: uuid.UUID | None = None,
) -> set[tuple[str, str, int, int]]:
    """Resolve book coverage in bulk, preserving the existing ``scope=mine`` semantics."""

    if not combos:
        return set()

    triples = {(item_id, location_id, quality) for item_id, location_id, quality, _ in combos}
    stmt = select(
        MarketScan.item_key,
        MarketScan.location_id,
        MarketScan.quality_level,
    ).where(
        MarketScan.server_id == server_id,
        MarketScan.fonte == MarketScanSource.BOOK,
        tuple_(
            MarketScan.item_key,
            MarketScan.location_id,
            MarketScan.quality_level,
        ).in_(list(triples)),
    )
    if user_id is not None:
        stmt = stmt.where(MarketScan.user_id == user_id)

    covered_triples = {tuple(row) for row in await session.execute(stmt)}
    return {combo for combo in combos if (combo[0], combo[1], combo[2]) in covered_triples}


async def query_24h_turnover(
    session: AsyncSession,
    server_id: str,
    combos: list[tuple[str, str, int]],
    user_id: uuid.UUID | None = None,
) -> dict[tuple[str, str, int], dict]:
    """combos: (item_id [ItemTypeId, via tabela `item`], location_id, quality_level) — sem
    enchantment_level, porque o histórico não carrega isso separado (fica embutido no
    AlbionId, ver docs/03-contrato-ingest-real.md secao 6). Só olha buckets de 1h
    (Timescale=0) das últimas 24h — é o giro real transacionado, não o livro. `user_id`
    tem a mesma semântica de `query_book_depth`."""
    if not combos:
        return {}

    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    stmt = (
        select(
            Item.unique_name,
            MarketHistoryEntry.location_id,
            MarketHistoryEntry.quality_level,
            func.sum(MarketHistoryEntry.item_amount).label("unidades"),
            func.sum(MarketHistoryEntry.silver_amount).label("silver_total"),
        )
        .select_from(MarketHistoryEntry)
        .join(Item, Item.albion_id == MarketHistoryEntry.item_id)
        .where(
            MarketHistoryEntry.server_id == server_id,
            MarketHistoryEntry.bucket_seconds == 3600,
            MarketHistoryEntry.bucket_start > cutoff,
            tuple_(
                Item.unique_name, MarketHistoryEntry.location_id, MarketHistoryEntry.quality_level
            ).in_(combos),
        )
        .group_by(
            Item.unique_name, MarketHistoryEntry.location_id, MarketHistoryEntry.quality_level
        )
    )
    if user_id is not None:
        stmt = stmt.where(_scan_exists_for_history(server_id, user_id))
    result = await session.execute(stmt)
    turnover = {}
    for r in result:
        units = int(r.unidades or 0)
        average_price = (r.silver_total / units) if units else None
        turnover[(r.unique_name, r.location_id, r.quality_level)] = {
            "units": units,
            "average_price": average_price,
        }
    return turnover


async def recompute_and_cache_book(
    session: AsyncSession,
    redis,
    server_id: str,
    combos: set[tuple[str, str, int, int]],
    freshness_hours: int,
) -> None:
    """Recalcula a profundidade do Postgres e grava o resultado inteiro no cache."""
    if not combos:
        return

    depth_rows = await query_book_depth(session, server_id, list(combos), freshness_hours)
    turnover_combos = {(item_id, loc, q) for item_id, loc, q, _ in combos}
    turnover_rows = await query_24h_turnover(session, server_id, list(turnover_combos))

    for item_id, loc, q, e in combos:
        row = depth_rows.get((item_id, loc, q, e))
        turnover = turnover_rows.get((item_id, loc, q))
        if row is None and turnover is None:
            await delete_book_depth(redis, server_id, item_id, loc, q, e)
            continue
        payload = _build_book_payload(row, turnover)
        await set_book_depth(redis, server_id, item_id, loc, q, e, payload)


async def record_scans(
    session: AsyncSession,
    server_id: str,
    user_id: uuid.UUID,
    fonte: MarketScanSource,
    combos: set[tuple[str, str, int]],
) -> None:
    """Uma linha de procedência por (usuário, item, local, qualidade,
    fonte), nunca uma por ordem/bucket — `n_varreduras` sobe a cada reenvio da mesma
    combinação, sem multiplicar a tabela-fato. combos: (item_key [unique_name], location_id,
    quality_level)."""
    if not combos:
        return
    rows = [
        {
            "server_id": server_id,
            "user_id": user_id,
            "item_key": item_key,
            "location_id": location_id,
            "quality_level": quality_level,
            "fonte": fonte,
        }
        for item_key, location_id, quality_level in combos
    ]
    stmt = pg_insert(MarketScan).values(rows)
    stmt = stmt.on_conflict_do_update(
        constraint="uq_market_scan",
        set_={"ultima_em": func.now(), "n_varreduras": MarketScan.n_varreduras + 1},
    )
    await session.execute(stmt)


async def _turnover_window(
    session: AsyncSession,
    server_id: str,
    item_id: str,
    location_id: str,
    quality_level: int,
    bucket_seconds: int,
    since: datetime,
) -> dict:
    """Giro somado numa janela/grão só, desde `since` — mesma média ponderada por volume de
    `query_24h_turnover`, generalizada para as janelas do endpoint de demanda."""
    stmt = (
        select(
            func.sum(MarketHistoryEntry.item_amount).label("unidades"),
            func.sum(MarketHistoryEntry.silver_amount).label("silver_total"),
        )
        .select_from(MarketHistoryEntry)
        .join(Item, Item.albion_id == MarketHistoryEntry.item_id)
        .where(
            MarketHistoryEntry.server_id == server_id,
            Item.unique_name == item_id,
            MarketHistoryEntry.location_id == location_id,
            MarketHistoryEntry.quality_level == quality_level,
            MarketHistoryEntry.bucket_seconds == bucket_seconds,
            MarketHistoryEntry.bucket_start > since,
        )
    )
    row = (await session.execute(stmt)).one()
    units = int(row.unidades or 0)
    average_price = (row.silver_total / units) if units else None
    return {"units": units, "average_price": average_price}


async def _serie_6h(
    session: AsyncSession,
    server_id: str,
    item_id: str,
    location_id: str,
    quality_level: int,
    since: datetime,
) -> list[dict]:
    stmt = (
        select(
            MarketHistoryEntry.bucket_start,
            MarketHistoryEntry.item_amount,
            MarketHistoryEntry.silver_amount,
        )
        .select_from(MarketHistoryEntry)
        .join(Item, Item.albion_id == MarketHistoryEntry.item_id)
        .where(
            MarketHistoryEntry.server_id == server_id,
            Item.unique_name == item_id,
            MarketHistoryEntry.location_id == location_id,
            MarketHistoryEntry.quality_level == quality_level,
            MarketHistoryEntry.bucket_seconds == 21600,
            MarketHistoryEntry.bucket_start > since,
        )
        .order_by(MarketHistoryEntry.bucket_start)
    )
    result = await session.execute(stmt)
    return [
        {
            "start": r.bucket_start,
            "units": int(r.item_amount),
            "average_price": (r.silver_amount / r.item_amount) if r.item_amount else None,
        }
        for r in result
    ]


async def get_item_demand(
    session: AsyncSession,
    server_id: str,
    item_id: str,
    location_id: str,
    quality_level: int,
    enchantment_level: int = 0,
) -> dict:
    """Combina profundidade do livro com giro real em três janelas e série de 6h.

    O resultado responde "quanta gente
    está comprando isso agora". `ultimas_24h` vem dos buckets de 1h (mais fino, retenção de
    48h); `ultimos_7d`/`ultimos_30d`/`serie_6h` vêm dos buckets de 6h (retenção de 90 dias) —
    nunca somados entre si, senão a mesma transação contaria duas vezes em duas
    granularidades diferentes."""
    now = datetime.now(timezone.utc)
    policy = get_market_book_policy()
    combo = (item_id, location_id, quality_level, enchantment_level)
    depth_rows = await query_book_depth(session, server_id, [combo], policy.freshness_hours)
    row = depth_rows.get(combo)

    if row is not None:
        sell = _build_side(
            row.menor_venda, row.venda_unidades, row.venda_qtd, row.venda_observada_em, now
        )
        buy = _build_side(
            row.maior_compra,
            row.compra_unidades,
            row.compra_qtd,
            row.compra_observada_em,
            now,
        )
    else:
        sell = _empty_side(now)
        buy = _empty_side(now)

    last_24h = await _turnover_window(
        session, server_id, item_id, location_id, quality_level, 3600, now - timedelta(hours=24)
    )
    last_7d = await _turnover_window(
        session, server_id, item_id, location_id, quality_level, 21600, now - timedelta(days=7)
    )
    last_30d = await _turnover_window(
        session, server_id, item_id, location_id, quality_level, 21600, now - timedelta(days=30)
    )
    series_6h = await _serie_6h(
        session, server_id, item_id, location_id, quality_level, now - timedelta(days=30)
    )

    item_row = await session.scalar(select(Item).where(Item.unique_name == item_id))

    return {
        "server": server_id,
        "item": {"unique_name": item_id, "name": item_row.name_pt if item_row else None},
        "location_id": location_id,
        "book": {
            "sell": sell,
            "buy": buy,
            "coverage": policy.coverage,
            "freshness_window_seconds": policy.freshness_seconds,
        },
        "sold": {
            "last_24h": last_24h,
            "last_7d": last_7d,
            "last_30d": last_30d,
        },
        "series_6h": series_6h,
    }


async def get_item_prices(
    session: AsyncSession,
    server_id: str,
    item_id: str,
    scope: str,
    user_id=None,
    location_ids: list[str] | None = None,
    quality_level: int | None = None,
    enchantment_level: int | None = None,
    limit: int = 100,
    offset: int = 0,
) -> dict:
    policy = get_market_book_policy()
    scan_user_id = user_id if scope == "mine" else None
    observed_combos, total = await query_item_combinations(
        session,
        server_id,
        item_id,
        user_id=scan_user_id,
        location_ids=location_ids,
        quality_level=quality_level,
        enchantment_level=enchantment_level,
        limit=limit,
        offset=offset,
    )
    combos = [(loc, q, e) for loc, q, e, _, _ in observed_combos]
    sources = {
        (loc, q, e): {"book": has_book, "history": has_history}
        for loc, q, e, has_book, has_history in observed_combos
    }

    cached: dict[tuple[str, int, int], dict | None] = {}
    if scope != "mine":
        cached = await mget_book_depths(get_redis(), server_id, item_id, combos)
        for combo, payload in cached.items():
            if payload is not None and payload.get("sources") != sources[combo]:
                cached[combo] = None

    missing = [c for c in combos if cached.get(c) is None]

    if missing:
        full_combos = {(item_id, loc, q, e) for loc, q, e in missing}
        depth_rows = await query_book_depth(
            session,
            server_id,
            list(full_combos),
            policy.freshness_hours,
            user_id=scan_user_id,
        )
        turnover_combos = {(item_id, loc, q) for loc, q, _ in missing}
        turnover_rows = await query_24h_turnover(
            session, server_id, list(turnover_combos), user_id=scan_user_id
        )

        redis = get_redis() if scope != "mine" else None
        for loc, q, e in missing:
            row = depth_rows.get((item_id, loc, q, e))
            turnover = turnover_rows.get((item_id, loc, q))
            if row is None and turnover is None:
                cached[(loc, q, e)] = None
                continue
            payload = _build_book_payload(
                row, turnover, policy=policy, sources=sources[(loc, q, e)]
            )
            cached[(loc, q, e)] = payload
            if redis is not None:
                await set_book_depth(redis, server_id, item_id, loc, q, e, payload)

    results = []
    response_now = datetime.now(timezone.utc)
    for loc, q, e in combos:
        payload = cached.get((loc, q, e))
        if payload is None:
            continue
        payload = _refresh_cached_ages(payload, response_now)
        results.append(
            {
                "location_id": loc,
                "quality_level": q,
                "enchantment_level": e,
                "sell": payload["sell"],
                "buy": payload["buy"],
                "sold_24h": payload["sold_24h"],
                "coverage": payload["coverage"],
                "freshness_window_seconds": payload["freshness_window_seconds"],
            }
        )
    return {"prices": results, "total": total, "limit": limit, "offset": offset}
