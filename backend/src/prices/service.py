import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import and_, exists, func, select, tuple_
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.engine import Row
from sqlalchemy.ext.asyncio import AsyncSession

from src.cache.redis_client import get_redis, mget_book_depths, publish_price_update, set_book_depth
from src.config import get_settings
from src.items.constants import ENCHANTMENT_LEVELS, QUALIDADES
from src.items.models import Item
from src.items.service import list_location_ids
from src.prices.models import MarketHistoryEntry, MarketOrder, MarketScan

settings = get_settings()


def _empty_lado() -> dict:
    return {"preco": None, "total_unidades": 0, "qtd_ordens": 0}


def _build_book_payload(row: Row | None, turnover: dict | None) -> dict:
    if row is not None:
        venda = {
            "preco": str(row.menor_venda) if row.menor_venda is not None else None,
            "total_unidades": int(row.venda_unidades or 0),
            "qtd_ordens": int(row.venda_qtd or 0),
        }
        compra = {
            "preco": str(row.maior_compra) if row.maior_compra is not None else None,
            "total_unidades": int(row.compra_unidades or 0),
            "qtd_ordens": int(row.compra_qtd or 0),
        }
        varredura_em = row.varredura_em.isoformat() if row.varredura_em is not None else None
    else:
        venda = _empty_lado()
        compra = _empty_lado()
        varredura_em = None

    vendido_24h = None
    if turnover is not None:
        vendido_24h = {
            "unidades": turnover["unidades"],
            "preco_medio": str(turnover["preco_medio"])
            if turnover["preco_medio"] is not None
            else None,
        }

    return {
        "venda": venda,
        "compra": compra,
        "vendido_24h": vendido_24h,
        "atualizado_em": datetime.now(timezone.utc).isoformat(),
        "varredura_em": varredura_em,
    }


def _scan_exists_for_order(user_id: uuid.UUID):
    return exists(
        select(MarketScan.id).where(
            MarketScan.user_id == user_id,
            MarketScan.item_key == MarketOrder.item_id,
            MarketScan.location_id == MarketOrder.location_id,
            MarketScan.quality_level == MarketOrder.quality_level,
        )
    )


def _scan_exists_for_history(user_id: uuid.UUID):
    return exists(
        select(MarketScan.id).where(
            MarketScan.user_id == user_id,
            MarketScan.item_key == Item.unique_name,
            MarketScan.location_id == MarketHistoryEntry.location_id,
            MarketScan.quality_level == MarketHistoryEntry.quality_level,
        )
    )


async def query_book_depth(
    session: AsyncSession,
    combos: list[tuple[str, str, int, int]],
    freshness_hours: int,
    user_id: uuid.UUID | None = None,
) -> dict[tuple[str, str, int, int], Row]:
    """Uma query agregada para todas as combinações (item_id, location_id, quality_level,
    enchantment_level) passadas. `venda`/`compra` só contam ordem dentro da janela de
    frescor e não expirada; `varredura_em` (max(last_seen_at)) ignora esse filtro de
    propósito — reflete a idade real do dado mesmo quando a profundidade zerou (task 29).
    `user_id` (task 30): quando presente, restringe às combinações que esse usuário varreu
    (`market_scan`) — os valores em si continuam vindo do acervo global, não de um recorte
    de dados separado por usuário."""
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
            func.max(MarketOrder.unit_price_silver)
            .filter(is_fresh, is_request)
            .label("maior_compra"),
            func.sum(MarketOrder.amount).filter(is_fresh, is_request).label("compra_unidades"),
            func.count().filter(is_fresh, is_request).label("compra_qtd"),
            func.max(MarketOrder.last_seen_at).label("varredura_em"),
        )
        .where(
            tuple_(
                MarketOrder.item_id,
                MarketOrder.location_id,
                MarketOrder.quality_level,
                MarketOrder.enchantment_level,
            ).in_(combos)
        )
        .group_by(
            MarketOrder.item_id,
            MarketOrder.location_id,
            MarketOrder.quality_level,
            MarketOrder.enchantment_level,
        )
    )
    if user_id is not None:
        stmt = stmt.where(_scan_exists_for_order(user_id))
    result = await session.execute(stmt)
    return {(r.item_id, r.location_id, r.quality_level, r.enchantment_level): r for r in result}


async def query_24h_turnover(
    session: AsyncSession,
    combos: list[tuple[str, str, int]],
    user_id: uuid.UUID | None = None,
) -> dict[tuple[str, str, int], dict]:
    """combos: (item_id [ItemTypeId, via tabela `item`], location_id, quality_level) — sem
    enchantment_level, porque o histórico não carrega isso separado (fica embutido no
    AlbionId, ver docs/03-contrato-ingest-real.md secao 6). Só olha buckets de 1h
    (Timescale=0) das últimas 24h — é o giro real transacionado, não o livro. `user_id`
    (task 30): mesma semântica de `query_book_depth`."""
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
        stmt = stmt.where(_scan_exists_for_history(user_id))
    result = await session.execute(stmt)
    turnover = {}
    for r in result:
        unidades = int(r.unidades or 0)
        preco_medio = (r.silver_total / unidades) if unidades else None
        turnover[(r.unique_name, r.location_id, r.quality_level)] = {
            "unidades": unidades,
            "preco_medio": preco_medio,
        }
    return turnover


async def recompute_and_cache_book(
    session: AsyncSession, redis, combos: set[tuple[str, str, int, int]], freshness_hours: int
) -> None:
    """Chamado pelo ingest (task 29) depois de gravar ordens ou histórico: recalcula a
    profundidade do Postgres — nunca soma o lote (achado C4: um lote só tem o que aquele
    jogador enxergou na tela) — e grava o resultado inteiro no cache."""
    if not combos:
        return

    depth_rows = await query_book_depth(session, list(combos), freshness_hours)
    turnover_combos = {(item_id, loc, q) for item_id, loc, q, _ in combos}
    turnover_rows = await query_24h_turnover(session, list(turnover_combos))

    for item_id, loc, q, e in combos:
        row = depth_rows.get((item_id, loc, q, e))
        turnover = turnover_rows.get((item_id, loc, q))
        if row is None and turnover is None:
            continue  # nunca visto em marketorders nem markethistories — nada a cachear
        payload = _build_book_payload(row, turnover)
        await set_book_depth(redis, item_id, loc, q, e, payload)
        await publish_price_update(
            redis,
            item_id,
            {
                "location_id": loc,
                "quality_level": q,
                "enchantment_level": e,
                "venda": payload["venda"],
                "compra": payload["compra"],
            },
        )


async def record_scans(
    session: AsyncSession,
    user_id: uuid.UUID,
    fonte: str,
    combos: set[tuple[str, str, int]],
) -> None:
    """Upsert de procedência (task 30): uma linha por (usuário, item, local, qualidade,
    fonte), nunca uma por ordem/bucket — `n_varreduras` sobe a cada reenvio da mesma
    combinação, sem multiplicar a tabela-fato. combos: (item_key [unique_name], location_id,
    quality_level)."""
    if not combos:
        return
    rows = [
        {
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
    item_id: str,
    location_id: str,
    quality_level: int,
    bucket_seconds: int,
    since: datetime,
) -> dict:
    """Giro somado numa janela/grão só, desde `since` — mesma média ponderada por volume de
    `query_24h_turnover`, generalizada pras janelas do endpoint de demanda (task 31)."""
    stmt = (
        select(
            func.sum(MarketHistoryEntry.item_amount).label("unidades"),
            func.sum(MarketHistoryEntry.silver_amount).label("silver_total"),
        )
        .select_from(MarketHistoryEntry)
        .join(Item, Item.albion_id == MarketHistoryEntry.item_id)
        .where(
            Item.unique_name == item_id,
            MarketHistoryEntry.location_id == location_id,
            MarketHistoryEntry.quality_level == quality_level,
            MarketHistoryEntry.bucket_seconds == bucket_seconds,
            MarketHistoryEntry.bucket_start > since,
        )
    )
    row = (await session.execute(stmt)).one()
    unidades = int(row.unidades or 0)
    preco_medio = (row.silver_total / unidades) if unidades else None
    return {"unidades": unidades, "preco_medio": preco_medio}


async def _serie_6h(
    session: AsyncSession, item_id: str, location_id: str, quality_level: int, since: datetime
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
            "inicio": r.bucket_start,
            "unidades": int(r.item_amount),
            "preco_medio": (r.silver_amount / r.item_amount) if r.item_amount else None,
        }
        for r in result
    ]


async def get_item_demand(
    session: AsyncSession,
    item_id: str,
    location_id: str,
    quality_level: int,
    enchantment_level: int = 0,
) -> dict:
    """Endpoint de demanda (task 31): profundidade do livro (o que está parado esperando) +
    giro real transacionado em 3 janelas + série de 6h — o objeto que responde "quanta gente
    está comprando isso agora". `ultimas_24h` vem dos buckets de 1h (mais fino, retenção de
    48h); `ultimos_7d`/`ultimos_30d`/`serie_6h` vêm dos buckets de 6h (retenção de 90 dias) —
    nunca somados entre si, senão a mesma transação contaria duas vezes em duas
    granularidades diferentes."""
    now = datetime.now(timezone.utc)
    combo = (item_id, location_id, quality_level, enchantment_level)
    depth_rows = await query_book_depth(session, [combo], settings.price_freshness_hours)
    row = depth_rows.get(combo)

    if row is not None:
        venda = {
            "preco": row.menor_venda,
            "total_unidades": int(row.venda_unidades or 0),
            "qtd_ordens": int(row.venda_qtd or 0),
        }
        compra = {
            "preco": row.maior_compra,
            "total_unidades": int(row.compra_unidades or 0),
            "qtd_ordens": int(row.compra_qtd or 0),
        }
        varredura_em = row.varredura_em
    else:
        venda = _empty_lado()
        compra = _empty_lado()
        varredura_em = None

    ultimas_24h = await _turnover_window(
        session, item_id, location_id, quality_level, 3600, now - timedelta(hours=24)
    )
    ultimos_7d = await _turnover_window(
        session, item_id, location_id, quality_level, 21600, now - timedelta(days=7)
    )
    ultimos_30d = await _turnover_window(
        session, item_id, location_id, quality_level, 21600, now - timedelta(days=30)
    )
    serie_6h = await _serie_6h(
        session, item_id, location_id, quality_level, now - timedelta(days=30)
    )

    item_row = await session.scalar(select(Item).where(Item.unique_name == item_id))

    return {
        "item": {"unique_name": item_id, "nome": item_row.name_pt if item_row else None},
        "location_id": location_id,
        "livro": {"venda": venda, "compra": compra, "varredura_em": varredura_em},
        "vendido": {
            "ultimas_24h": ultimas_24h,
            "ultimos_7d": ultimos_7d,
            "ultimos_30d": ultimos_30d,
        },
        "serie_6h": serie_6h,
    }


async def get_item_prices(
    session: AsyncSession, item_id: str, scope: str, user_id=None
) -> list[dict]:
    locations = await list_location_ids(session)
    combos = [(loc, q, e) for loc in locations for q in QUALIDADES for e in ENCHANTMENT_LEVELS]

    cached: dict[tuple[str, int, int], dict | None] = {}
    if scope != "mine":
        cached = await mget_book_depths(get_redis(), item_id, combos)

    missing = [c for c in combos if cached.get(c) is None]

    scan_user_id = user_id if scope == "mine" else None

    if missing:
        full_combos = {(item_id, loc, q, e) for loc, q, e in missing}
        depth_rows = await query_book_depth(
            session, list(full_combos), settings.price_freshness_hours, user_id=scan_user_id
        )
        turnover_combos = {(item_id, loc, q) for loc, q, _ in missing}
        turnover_rows = await query_24h_turnover(
            session, list(turnover_combos), user_id=scan_user_id
        )

        redis = get_redis() if scope != "mine" else None
        for loc, q, e in missing:
            row = depth_rows.get((item_id, loc, q, e))
            turnover = turnover_rows.get((item_id, loc, q))
            if row is None and turnover is None:
                cached[(loc, q, e)] = None
                continue
            payload = _build_book_payload(row, turnover)
            cached[(loc, q, e)] = payload
            if redis is not None:
                await set_book_depth(redis, item_id, loc, q, e, payload)

    results = []
    for loc, q, e in combos:
        payload = cached.get((loc, q, e))
        if payload is None:
            continue
        results.append(
            {
                "location_id": loc,
                "quality_level": q,
                "enchantment_level": e,
                "venda": payload["venda"],
                "compra": payload["compra"],
                "vendido_24h": payload["vendido_24h"],
                "varredura_em": payload["varredura_em"],
            }
        )
    return results
