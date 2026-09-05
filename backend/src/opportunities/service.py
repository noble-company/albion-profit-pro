from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import Interval, and_, func, literal, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.craft import constants
from src.items.models import Item
from src.items.normalization import normalize_item_search
from src.opportunities.ranking_service import read_recipe_ranking
from src.opportunities.schemas import OpportunityOut, RankingCoverage
from src.opportunities.sorting import apply_order
from src.prices.constants import AlbionServer
from src.prices.models import MarketOrder
from src.prices.policy import get_market_book_policy
from src.prices.service import LATEST_OBSERVATION_TOLERANCE


def _flip_item_filters(item_id, category, subcategory, subcategory2, subcategory3, tier):
    """Item-scoped predicates shared by the flip query. Empty when no item filter is active."""
    predicates = []
    if item_id:
        predicates.append(
            or_(
                MarketOrder.item_id == item_id,
                Item.busca_normalizada.contains(normalize_item_search(item_id), autoescape=True),
            )
        )
    if category:
        predicates.append(Item.shop_category == category)
    if subcategory:
        predicates.append(Item.shop_subcategory == subcategory)
    if subcategory2:
        predicates.append(Item.shop_subcategory2 == subcategory2)
    if subcategory3:
        predicates.append(Item.shop_subcategory3 == subcategory3)
    if tier is not None:
        predicates.append(Item.tier == tier)
    return predicates


async def flip_opportunities(
    session: AsyncSession,
    server: str,
    *,
    item_id: str | None = None,
    category: str | None = None,
    subcategory: str | None = None,
    subcategory2: str | None = None,
    subcategory3: str | None = None,
    locations: list[str],
    tier: int | None,
    enchantment: int | None,
    limit: int,
    offset: int,
    min_profit: Decimal | None,
    min_roi: Decimal | None,
    quality: int | None = None,
    max_age_hours: int | None = None,
    require_complete: bool = False,
    premium: bool = True,
    buy_order: bool = False,
    sell_order: bool = False,
    sort: str = "profit",
    direction: str = "desc",
) -> tuple[list[OpportunityOut], int]:
    """Rank cross-city arbitrage entirely in PostgreSQL.

    The book is projected to the best executable offer and the best executable request per city
    (top of book, ``price_model="top_of_book"``), the buy/sell cross join runs as a SQL self-join,
    and ordering/pagination/counting happen in the database. Expired orders are excluded, matching
    the craft engine. A constant two statements run per request regardless of dataset size.
    """
    policy = get_market_book_policy()
    sales_tax_rate = (
        constants.DEFAULT_PREMIUM_SALES_TAX_RATE
        if premium
        else constants.DEFAULT_NON_PREMIUM_SALES_TAX_RATE
    )
    setup_fee_rate = constants.DEFAULT_SETUP_FEE_RATE
    tolerance = literal(LATEST_OBSERVATION_TOLERANCE, Interval())
    item_filters = _flip_item_filters(
        item_id, category, subcategory, subcategory2, subcategory3, tier
    )

    # 1. Every book row plus the newest observation timestamp for its (item, city, quality,
    #    enchantment, side) partition. The window replaces the per-row correlated subquery.
    base = select(
        MarketOrder.item_id.label("item_id"),
        MarketOrder.location_id.label("location_id"),
        MarketOrder.quality_level.label("quality_level"),
        MarketOrder.enchantment_level.label("enchantment_level"),
        MarketOrder.auction_type.label("auction_type"),
        MarketOrder.unit_price_silver.label("unit_price"),
        MarketOrder.amount.label("amount"),
        MarketOrder.last_seen_at.label("last_seen_at"),
        MarketOrder.expires.label("expires"),
        func.max(MarketOrder.last_seen_at)
        .over(
            partition_by=(
                MarketOrder.item_id,
                MarketOrder.location_id,
                MarketOrder.quality_level,
                MarketOrder.enchantment_level,
                MarketOrder.auction_type,
            )
        )
        .label("latest_seen"),
    ).where(
        MarketOrder.server_id == server,
        MarketOrder.auction_type.in_(["offer", "request"]),
    )
    if item_filters:
        base = base.join(Item, Item.unique_name == MarketOrder.item_id).where(*item_filters)
    if locations:
        base = base.where(MarketOrder.location_id.in_(locations))
    if enchantment is not None:
        base = base.where(MarketOrder.enchantment_level == enchantment)
    if quality is not None:
        base = base.where(MarketOrder.quality_level == quality)
    base_cte = base.cte("flip_orders")

    # 2. Keep only the newest observation per side, and only orders still live in game.
    fresh = select(base_cte).where(
        base_cte.c.last_seen_at >= base_cte.c.latest_seen - tolerance,
        base_cte.c.expires > func.now(),
    )
    if max_age_hours is not None:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=max_age_hours)
        fresh = fresh.where(base_cte.c.last_seen_at >= cutoff)
    fresh_cte = fresh.cte("fresh_flip_orders")

    def _best_side(auction_type: str, price_order):
        return (
            select(
                fresh_cte.c.item_id,
                fresh_cte.c.location_id,
                fresh_cte.c.quality_level,
                fresh_cte.c.enchantment_level,
                fresh_cte.c.unit_price.label("price"),
                fresh_cte.c.amount.label("amount"),
                fresh_cte.c.last_seen_at.label("seen"),
            )
            .where(fresh_cte.c.auction_type == auction_type)
            .distinct(
                fresh_cte.c.item_id,
                fresh_cte.c.location_id,
                fresh_cte.c.quality_level,
                fresh_cte.c.enchantment_level,
            )
            .order_by(
                fresh_cte.c.item_id,
                fresh_cte.c.location_id,
                fresh_cte.c.quality_level,
                fresh_cte.c.enchantment_level,
                price_order,
                fresh_cte.c.amount.desc(),
                fresh_cte.c.last_seen_at.desc(),
            )
        )

    offers = _best_side("offer", fresh_cte.c.unit_price.asc()).cte("best_offers")
    requests = _best_side("request", fresh_cte.c.unit_price.desc()).cte("best_requests")

    # 3. Cross city buy vs sell as a self-join, then the money math from craft's rates.
    qty = func.least(offers.c.amount, requests.c.amount)
    cost = offers.c.price * qty
    gross = requests.c.price * qty
    buy_setup = func.ceil(cost * setup_fee_rate) if buy_order else literal(Decimal("0"))
    sell_setup = func.ceil(gross * setup_fee_rate) if sell_order else literal(Decimal("0"))
    sales_tax = func.ceil(gross * sales_tax_rate)
    net_revenue = gross - sales_tax - sell_setup
    total_cost = cost + buy_setup
    total_fees = sales_tax + sell_setup + buy_setup
    profit = net_revenue - total_cost
    roi = func.round(profit / func.nullif(total_cost, 0) * 100, 4)
    oldest_seen = func.least(offers.c.seen, requests.c.seen)
    age_seconds = func.extract("epoch", func.now() - oldest_seen)

    computed = (
        select(
            offers.c.item_id.label("item_id"),
            offers.c.quality_level.label("quality_level"),
            offers.c.location_id.label("buy_location"),
            requests.c.location_id.label("sell_location"),
            offers.c.price.label("buy_price"),
            requests.c.price.label("sell_price"),
            qty.label("quantity"),
            gross.label("gross_revenue"),
            sales_tax.label("sales_tax"),
            sell_setup.label("sale_setup_fee"),
            buy_setup.label("acquisition_setup_fee"),
            total_fees.label("total_fees"),
            total_cost.label("total_cost"),
            net_revenue.label("net_revenue"),
            profit.label("profit"),
            roi.label("roi"),
            oldest_seen.label("oldest_seen"),
            (age_seconds > policy.freshness_seconds).label("is_stale"),
        )
        .select_from(
            offers.join(
                requests,
                and_(
                    offers.c.item_id == requests.c.item_id,
                    offers.c.quality_level == requests.c.quality_level,
                    offers.c.enchantment_level == requests.c.enchantment_level,
                    offers.c.location_id != requests.c.location_id,
                ),
            )
        )
        .cte("flip_candidates")
    )

    # 4. Filter, count and paginate in the database. The item name join stays out of the
    #    candidate set and runs only over the page (<= limit rows).
    filtered = select(computed)
    conditions = []
    if min_profit is not None:
        conditions.append(computed.c.profit >= min_profit)
    if min_roi is not None:
        conditions.append(computed.c.roi >= min_roi)
    if require_complete:
        conditions.append(computed.c.is_stale.is_(False))
    if conditions:
        filtered = filtered.where(*conditions)
    filtered_cte = filtered.cte("filtered_flips")

    total = int(await session.scalar(select(func.count()).select_from(filtered_cte)) or 0)

    def _order(cols):
        return apply_order(
            {
                "profit": cols.profit,
                "roi": cols.roi,
                "freshness": cols.oldest_seen,
            },
            [
                cols.item_id.asc(),
                cols.buy_location.asc(),
                cols.sell_location.asc(),
                cols.quality_level.asc(),
            ],
            sort,
            direction,
        )

    page_ids = (
        select(filtered_cte)
        .order_by(*_order(filtered_cte.c))
        .limit(limit)
        .offset(offset)
        .subquery("flip_page")
    )
    page = (
        select(page_ids, Item.name_pt.label("name_pt"), Item.name_en.label("name_en"))
        .join(Item, Item.unique_name == page_ids.c.item_id)
        .order_by(*_order(page_ids.c))
    )
    rows = (await session.execute(page)).all()

    results = [
        OpportunityOut(
            kind="flip",
            item=row.item_id,
            item_name=row.name_pt or row.name_en,
            quality_level=row.quality_level,
            buy_location=row.buy_location,
            sell_location=row.sell_location,
            buy_price=row.buy_price,
            sell_price=row.sell_price,
            quantity=int(row.quantity),
            gross_revenue=row.gross_revenue,
            sales_tax=row.sales_tax,
            sale_setup_fee=row.sale_setup_fee,
            net_revenue=row.net_revenue,
            acquisition_setup_fee=row.acquisition_setup_fee,
            total_fees=row.total_fees,
            total_cost=row.total_cost,
            profit=row.profit,
            roi=row.roi,
            oldest_observed_at=row.oldest_seen.isoformat() if row.oldest_seen else None,
            warnings=[constants.CraftWarning.STALE_DATA.value] if row.is_stale else [],
            price_model="top_of_book",
        )
        for row in rows
    ]
    return results, total


async def recipe_opportunities(
    session: AsyncSession,
    server: AlbionServer,
    *,
    kind: str,
    locations: list[str],
    tier: int | None,
    enchantment: int | None,
    limit: int,
    offset: int,
    min_profit: Decimal | None,
    min_roi: Decimal | None,
    quality: int | None = None,
    max_age_hours: int | None = None,
    require_complete: bool = False,
    return_rate: Decimal = Decimal("0"),
    station_cost_per_execution: Decimal = Decimal("0"),
    use_focus: bool = False,
    premium: bool = True,
    item_id: str | None = None,
    sort: str = "profit",
    direction: str = "desc",
) -> tuple[list[OpportunityOut], int, RankingCoverage]:
    """Serve /opportunities/refining and /crafting from the materialized ranking (B02).

    Filtering, ordering and pagination run in PostgreSQL over ``recipe_ranking``; premium, tax,
    return and station are a cheap projection over the page. The exact per-item recompute stays
    in ``POST /craft/simulate``. The ranking is rebuilt by ``opportunities.rebuild_recipe_ranking``.
    """
    return await read_recipe_ranking(
        session,
        server.value,
        kind=kind,
        locations=locations,
        tier=tier,
        enchantment=enchantment,
        limit=limit,
        offset=offset,
        min_profit=min_profit,
        min_roi=min_roi,
        quality=quality,
        max_age_hours=max_age_hours,
        require_complete=require_complete,
        return_rate=return_rate,
        station_cost_per_execution=station_cost_per_execution,
        use_focus=use_focus,
        premium=premium,
        item_id=item_id,
        sort=sort,
        direction=direction,
    )
