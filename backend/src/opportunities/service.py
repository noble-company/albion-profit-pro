from datetime import datetime, timedelta, timezone
from decimal import ROUND_CEILING, Decimal

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.craft.schemas import CraftSimulationRequest
from src.craft.service import simulate_craft
from src.items.models import Item, Location
from src.items.normalization import normalize_item_search
from src.opportunities.schemas import OpportunityOut
from src.prices.constants import AlbionServer
from src.prices.models import MarketOrder
from src.prices.service import latest_order_observation_filter
from src.recipes.models import Recipe, RecipeIngredient

PREMIUM_SALES_TAX = Decimal("0.04")
NON_PREMIUM_SALES_TAX = Decimal("0.08")
SETUP_FEE = Decimal("0.025")


def _charge(amount: Decimal, rate: Decimal) -> Decimal:
    return (amount * rate).quantize(Decimal("1"), rounding=ROUND_CEILING)


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
    statement = (
        select(MarketOrder, Item)
        .join(Item, Item.unique_name == MarketOrder.item_id)
        .where(
            MarketOrder.server_id == server,
            latest_order_observation_filter(),
            MarketOrder.auction_type.in_(["offer", "request"]),
        )
    )
    if locations:
        statement = statement.where(MarketOrder.location_id.in_(locations))
    if item_id:
        normalized_item = normalize_item_search(item_id)
        statement = statement.where(
            or_(
                MarketOrder.item_id == item_id,
                Item.busca_normalizada.contains(normalized_item, autoescape=True),
            )
        )
    if category:
        statement = statement.where(Item.shop_category == category)
    if subcategory:
        statement = statement.where(Item.shop_subcategory == subcategory)
    if subcategory2:
        statement = statement.where(Item.shop_subcategory2 == subcategory2)
    if subcategory3:
        statement = statement.where(Item.shop_subcategory3 == subcategory3)
    if tier is not None:
        statement = statement.where(Item.tier == tier)
    if enchantment is not None:
        statement = statement.where(MarketOrder.enchantment_level == enchantment)
    if quality is not None:
        statement = statement.where(MarketOrder.quality_level == quality)
    if max_age_hours is not None:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=max_age_hours)
        statement = statement.where(MarketOrder.last_seen_at >= cutoff)
    rows = (await session.execute(statement)).all()
    grouped: dict[tuple[str, int, int, str], dict[str, list[tuple[MarketOrder, Item]]]] = {}
    for order, item in rows:
        key = (order.item_id, order.quality_level, order.enchantment_level, order.location_id)
        grouped.setdefault(key, {"offer": [], "request": []})[order.auction_type].append(
            (order, item)
        )
    results: list[OpportunityOut] = []
    for (item_id, quality, ench, location), sides in grouped.items():
        offers = sides["offer"]
        if not offers:
            continue
        buy = min(offers, key=lambda pair: pair[0].unit_price_silver)
        for (other_item, other_quality, other_ench, sell_location), sell_sides in grouped.items():
            if (
                other_item != item_id
                or other_quality != quality
                or other_ench != ench
                or sell_location == location
                or not sell_sides["request"]
            ):
                continue
            sale = max(sell_sides["request"], key=lambda pair: pair[0].unit_price_silver)
            qty = min(buy[0].amount, sale[0].amount)
            cost = buy[0].unit_price_silver * qty
            buy_setup = _charge(cost, SETUP_FEE) if buy_order else Decimal("0")
            gross_revenue = sale[0].unit_price_silver * qty
            sales_tax = _charge(
                gross_revenue, PREMIUM_SALES_TAX if premium else NON_PREMIUM_SALES_TAX
            )
            sell_setup = _charge(gross_revenue, SETUP_FEE) if sell_order else Decimal("0")
            revenue = gross_revenue - sales_tax - sell_setup
            total_cost = cost + buy_setup
            profit = revenue - total_cost
            roi = (profit / total_cost * 100) if total_cost else None
            if min_profit is not None and (profit is None or profit < min_profit):
                continue
            if min_roi is not None and (roi is None or roi < min_roi):
                continue
            warnings = []
            oldest = min(buy[0].last_seen_at, sale[0].last_seen_at)
            if oldest.tzinfo is None:
                oldest = oldest.replace(tzinfo=timezone.utc)
            age = (datetime.now(timezone.utc) - oldest).total_seconds()
            if age > 6 * 3600:
                warnings.append("dado_velho")
            if require_complete and warnings:
                continue
            results.append(
                OpportunityOut(
                    kind="flip",
                    item=item_id,
                    item_name=buy[1].name_pt or buy[1].name_en,
                    quality_level=quality,
                    buy_location=location,
                    sell_location=sell_location,
                    buy_price=buy[0].unit_price_silver,
                    sell_price=sale[0].unit_price_silver,
                    quantity=qty,
                    total_cost=total_cost,
                    gross_revenue=revenue,
                    profit=profit,
                    roi=roi,
                    oldest_observed_at=oldest.isoformat(),
                    warnings=warnings,
                )
            )
    results.sort(key=lambda row: row.profit or Decimal("-1"), reverse=True)
    total = len(results)
    return results[offset : offset + limit], total


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
