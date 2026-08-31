from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import Interval, and_, func, literal, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.craft import constants
from src.craft.schemas import CraftSimulationRequest
from src.craft.service import simulate_craft
from src.items.models import Item, Location
from src.items.normalization import normalize_item_search
from src.opportunities.schemas import OpportunityOut
from src.prices.constants import AlbionServer
from src.prices.models import MarketOrder
from src.prices.policy import get_market_book_policy
from src.prices.service import LATEST_OBSERVATION_TOLERANCE, latest_order_observation_filter
from src.recipes.models import Recipe, RecipeIngredient


def _is_refining_item(item: Item) -> bool:
    category = " ".join(
        value.lower() for value in (item.shop_category, item.shop_subcategory) if value
    )
    return any(token in category for token in ("resource", "refin", "material"))


def _refining_item_filter():
    """SQL equivalent of ``_is_refining_item`` used before the candidate cap."""
    category = func.coalesce(Item.shop_category, "")
    subcategory = func.coalesce(Item.shop_subcategory, "")
    return or_(
        *(
            column.ilike(f"%{token}%")
            for column in (category, subcategory)
            for token in ("resource", "refin", "material")
        )
    )


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

    page_ids = (
        select(filtered_cte)
        .order_by(filtered_cte.c.profit.desc().nulls_last())
        .limit(limit)
        .offset(offset)
        .subquery("flip_page")
    )
    page = (
        select(page_ids, Item.name_pt.label("name_pt"), Item.name_en.label("name_en"))
        .join(Item, Item.unique_name == page_ids.c.item_id)
        .order_by(page_ids.c.profit.desc().nulls_last())
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
            total_cost=row.total_cost,
            gross_revenue=row.net_revenue,
            profit=row.profit,
            roi=row.roi,
            oldest_observed_at=row.oldest_seen.isoformat() if row.oldest_seen else None,
            warnings=["dado_velho"] if row.is_stale else [],
            price_model="top_of_book",
        )
        for row in rows
    ]
    return results, total


async def recipe_opportunities(
    session: AsyncSession,
    server: AlbionServer,
    user_id,
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
) -> tuple[list[OpportunityOut], int]:
    """Rank recipes using the same quote/formula engine as the detail calculator.

    This is deliberately an in-process batch: it does not make HTTP calls per item and keeps
    the money calculation in ``src.craft``. The candidate cap protects the API while the
    dedicated cache/ranking materialization remains a later optimization.
    """
    refining_filter = _refining_item_filter()
    statement = select(Recipe.output_item_unique_name, Item).join(
        Item, Item.unique_name == Recipe.output_item_unique_name
    )
    if tier is not None:
        statement = statement.where(Item.tier == tier)
    if enchantment is not None:
        statement = statement.where(Item.enchantment_level == enchantment)
    statement = statement.where(refining_filter if kind == "refining" else ~refining_filter)
    statement = statement.order_by(Recipe.output_item_unique_name).limit(200)
    rows = (await session.execute(statement)).all()
    candidates = []
    for output_item, item in rows:
        is_refining = _is_refining_item(item)
        if (kind == "refining") != is_refining:
            continue
        candidates.append((output_item, item))

    ingredient_names = {
        unique_name: name_pt or name_en
        for unique_name, name_pt, name_en in (
            await session.execute(
                select(
                    RecipeIngredient.ingredient_unique_name,
                    Item.name_pt,
                    Item.name_en,
                )
                .join(Recipe, Recipe.id == RecipeIngredient.recipe_id)
                .outerjoin(Item, Item.unique_name == RecipeIngredient.ingredient_unique_name)
                .where(
                    Recipe.output_item_unique_name.in_(
                        [output_item for output_item, _item in candidates]
                    )
                )
            )
        ).all()
    }

    city_ids = locations or [
        row[0]
        for row in (
            await session.execute(
                select(Location.location_id)
                .where(Location.kind == "city")
                .order_by(Location.location_id)
            )
        ).all()
    ]
    quality_statement = select(
        MarketOrder.item_id,
        MarketOrder.location_id,
        MarketOrder.quality_level,
    ).where(
        MarketOrder.server_id == server.value,
        MarketOrder.item_id.in_([output_item for output_item, _item in candidates]),
        MarketOrder.location_id.in_(city_ids),
        MarketOrder.auction_type.in_(["offer", "request"]),
        latest_order_observation_filter(),
    )
    if quality is not None:
        quality_statement = quality_statement.where(MarketOrder.quality_level == quality)
    observed_qualities: dict[tuple[str, str], set[int]] = {}
    for output_item, location_id, quality_level in (
        await session.execute(quality_statement.distinct())
    ).all():
        observed_qualities.setdefault((output_item, location_id), set()).add(quality_level)

    results: list[OpportunityOut] = []
    for output_item, item in candidates:
        for location_id in city_ids:
            for output_quality in sorted(observed_qualities.get((output_item, location_id), set())):
                try:
                    simulation = await simulate_craft(
                        session,
                        CraftSimulationRequest(
                            server=server,
                            output_item=output_item,
                            location_id=location_id,
                            quantity=1,
                            output_quality=output_quality,
                            return_rate=return_rate,
                            station_cost_per_execution=station_cost_per_execution,
                            use_focus=use_focus,
                            premium=premium,
                        ),
                        user_id,
                        freshness_hours=max_age_hours,
                    )
                except (LookupError, ValueError):
                    continue
                scenarios = [
                    scenario
                    for scenario in simulation["scenarios"]
                    if scenario["profit"] is not None
                ]
                if not scenarios:
                    continue
                scenario = max(scenarios, key=lambda row: row["profit"])
                profit = scenario["profit"]
                roi = scenario["roi"]
                if min_profit is not None and (profit is None or profit < min_profit):
                    continue
                if min_roi is not None and (roi is None or roi < min_roi):
                    continue
                costs = scenario["costs"]
                revenue = scenario["revenue"]
                warnings = sorted({str(warning) for warning in scenario["warnings"]})
                acquisition_quote_key = (
                    "immediate_purchase"
                    if scenario["acquisition_mode"] == "immediate"
                    else "buy_order"
                )
                sale_quote_key = (
                    "immediate_sale" if scenario["sale_mode"] == "immediate" else "sell_order"
                )
                observed_at = [
                    ingredient[acquisition_quote_key]["oldest_observed_at"]
                    for ingredient in simulation["ingredients"]
                    if ingredient[acquisition_quote_key]["oldest_observed_at"] is not None
                ]
                output_observed_at = simulation["output_quotes"][sale_quote_key][
                    "oldest_observed_at"
                ]
                if output_observed_at is not None:
                    observed_at.append(output_observed_at)
                oldest_observed_at = min(observed_at) if observed_at else None
                if (
                    max_age_hours is not None
                    and oldest_observed_at is not None
                    and datetime.now(timezone.utc) - oldest_observed_at
                    > timedelta(hours=max_age_hours)
                ):
                    continue
                if require_complete and warnings:
                    continue
                results.append(
                    OpportunityOut(
                        kind=kind,
                        item=output_item,
                        item_name=item.name_pt or item.name_en,
                        quality_level=output_quality,
                        buy_location=location_id,
                        sell_location=location_id,
                        buy_price=(costs["total_cost"] / simulation["produced_quantity"])
                        if costs["total_cost"] is not None
                        else None,
                        sell_price=(revenue["gross_revenue"] / simulation["produced_quantity"])
                        if revenue["gross_revenue"] is not None
                        else None,
                        quantity=simulation["produced_quantity"],
                        total_cost=costs["total_cost"],
                        gross_revenue=revenue["gross_revenue"],
                        profit=profit,
                        roi=roi,
                        acquisition_mode=scenario["acquisition_mode"],
                        sale_mode=scenario["sale_mode"],
                        ingredients=[
                            {
                                "item": ingredient["unique_name"],
                                "item_name": ingredient_names.get(ingredient["unique_name"]),
                                "gross_quantity": ingredient["gross_quantity"],
                                "expected_return_quantity": ingredient["expected_return_quantity"],
                                "purchase_quantity": ingredient["purchase_quantity"],
                            }
                            for ingredient in simulation["ingredients"]
                        ],
                        station_cost=costs["station_cost"],
                        focus_consumed=simulation["focus_consumed"],
                        oldest_observed_at=(
                            oldest_observed_at.isoformat()
                            if oldest_observed_at is not None
                            else None
                        ),
                        warnings=warnings,
                    )
                )
    results.sort(key=lambda row: row.profit or Decimal("-1"), reverse=True)
    total = len(results)
    return results[offset : offset + limit], total
