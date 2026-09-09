import uuid
from collections import defaultdict
from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from src.craft import constants
from src.craft.constants import AcquisitionMode, CraftWarning, SaleMode
from src.craft.formulas import (
    calculate_acquisition_cost,
    calculate_financial_result,
    calculate_focus_consumed,
    calculate_ingredient_requirement,
    calculate_production,
    calculate_sale_revenue,
    calculate_station_fee,
)
from src.craft.quotes import QuoteResult, manual_side, ordered_warnings, quote
from src.craft.schemas import CraftCompareRequest
from src.craft.service import InvalidOverrideError
from src.items.service import list_eligible_craft_locations
from src.prices.policy import get_market_book_policy
from src.prices.service import (
    ExecutableBookLevel,
    query_book_coverage,
    query_executable_book_levels,
)
from src.recipes.models import Recipe
from src.recipes.service import get_item_values, get_recipe_family


@dataclass(frozen=True, slots=True)
class AcquisitionNeed:
    item_id: str
    quality_level: int
    enchantment_level: int
    quantity: int
    category: str


def _rates(request: CraftCompareRequest) -> tuple[Decimal, Decimal]:
    sales_tax_rate = request.sales_tax_rate
    if sales_tax_rate is None:
        sales_tax_rate = (
            constants.DEFAULT_PREMIUM_SALES_TAX_RATE
            if request.premium
            else constants.DEFAULT_NON_PREMIUM_SALES_TAX_RATE
        )
    setup_fee_rate = request.setup_fee_rate
    if setup_fee_rate is None:
        setup_fee_rate = constants.DEFAULT_SETUP_FEE_RATE
    return sales_tax_rate, setup_fee_rate


def _ingredient_needs(
    recipe: Recipe,
    executions: int,
    request: CraftCompareRequest,
) -> list[AcquisitionNeed]:
    needs = []
    for ingredient in recipe.ingredients:
        override = request.ingredient_overrides.get(ingredient.ingredient_unique_name)
        quality = override.quality_level if override is not None else 1
        return_eligible = override.return_eligible if override is not None else True
        requirement = calculate_ingredient_requirement(
            ingredient.count,
            executions,
            request.return_rate,
            return_eligible=return_eligible,
        )
        needs.append(
            AcquisitionNeed(
                ingredient.ingredient_unique_name,
                quality,
                ingredient.enchantment_level,
                requirement.purchase_quantity,
                "ingredient",
            )
        )
    return needs


def _merge_needs(needs: list[AcquisitionNeed]) -> list[AcquisitionNeed]:
    grouped: dict[tuple[str, int, int, str], int] = defaultdict(int)
    for need in needs:
        grouped[(need.item_id, need.quality_level, need.enchantment_level, need.category)] += (
            need.quantity
        )
    return [
        AcquisitionNeed(item, quality, enchantment, quantity, category)
        for (item, quality, enchantment, category), quantity in grouped.items()
    ]


def _quote_for_mode(
    request: CraftCompareRequest,
    need: AcquisitionNeed,
    combo: tuple[str, str, int, int],
    levels_by_combo: dict[tuple[str, str, int, int], list[ExecutableBookLevel]],
    coverage: set[tuple[str, str, int, int]],
) -> QuoteResult:
    immediate = request.acquisition_mode is AcquisitionMode.IMMEDIATE
    return quote(
        need.quantity,
        "offer" if immediate else "request",
        levels_by_combo.get(combo, []),
        manual_side(request.manual_prices, need.item_id, "offer" if immediate else "request"),
        covered=combo in coverage,
        order=not immediate,
    )


def _sale_quote(
    request: CraftCompareRequest,
    quantity: int,
    combo: tuple[str, str, int, int],
    levels_by_combo: dict[tuple[str, str, int, int], list[ExecutableBookLevel]],
    coverage: set[tuple[str, str, int, int]],
) -> QuoteResult:
    immediate = request.sale_mode is SaleMode.IMMEDIATE
    return quote(
        quantity,
        "request" if immediate else "offer",
        levels_by_combo.get(combo, []),
        manual_side(
            request.manual_prices, request.output_item, "request" if immediate else "offer"
        ),
        covered=combo in coverage,
        order=not immediate,
    )


def _reason(quotes: list[QuoteResult], sale_quote: QuoteResult) -> str | None:
    warnings = ordered_warnings(*(quote.warnings for quote in quotes), sale_quote.warnings)
    return ",".join(warning.value for warning in warnings) if warnings else None


def _build_route(
    *,
    route: str,
    request: CraftCompareRequest,
    location_id: str,
    needs: list[AcquisitionNeed],
    executions: int,
    produced_quantity: int,
    surplus_quantity: int,
    focus_consumed: int,
    recipe_silver_cost: Decimal,
    station_cost: Decimal,
    upgrade_steps: list[dict],
    levels_by_combo: dict[tuple[str, str, int, int], list[ExecutableBookLevel]],
    coverage: set[tuple[str, str, int, int]],
    output_enchantment: int,
    sales_tax_rate: Decimal,
    setup_fee_rate: Decimal,
    structural_reason: str | None = None,
) -> dict:
    needs = _merge_needs(needs)
    quote_rows = []
    quote_results = []
    category_costs: dict[str, Decimal] = defaultdict(lambda: Decimal("0"))
    for need in needs:
        combo = (need.item_id, location_id, need.quality_level, need.enchantment_level)
        quote = _quote_for_mode(request, need, combo, levels_by_combo, coverage)
        quote_results.append(quote)
        if quote.complete:
            category_costs[need.category] += quote.payload["total"]
        quote_rows.append(
            {
                "item_id": need.item_id,
                "quality_level": need.quality_level,
                "enchantment_level": need.enchantment_level,
                "quantity": need.quantity,
                "category": need.category,
                "quote": quote.payload,
            }
        )

    output_combo = (
        request.output_item,
        location_id,
        request.output_quality,
        output_enchantment,
    )
    sale_quote = _sale_quote(request, produced_quantity, output_combo, levels_by_combo, coverage)
    acquisition_complete = all(quote.complete for quote in quote_results)
    available = structural_reason is None and acquisition_complete and sale_quote.complete

    setup_fee = None
    total_cost = None
    if structural_reason is None and acquisition_complete:
        setup_fee = sum(
            (
                calculate_acquisition_cost(
                    quote.payload["total"], request.acquisition_mode, setup_fee_rate
                ).setup_fee
                for quote in quote_results
            ),
            start=Decimal("0"),
        )
        total_cost = (
            sum(category_costs.values(), start=Decimal("0"))
            + setup_fee
            + recipe_silver_cost
            + station_cost
        )

    net_revenue = None
    profit = None
    profit_per_unit = None
    roi = None
    if sale_quote.complete:
        net_revenue = calculate_sale_revenue(
            sale_quote.payload["total"], request.sale_mode, sales_tax_rate, setup_fee_rate
        ).net_revenue
    if available and total_cost is not None and net_revenue is not None:
        result = calculate_financial_result(total_cost, net_revenue, produced_quantity)
        profit, profit_per_unit, roi = result.profit, result.profit_per_unit, result.roi

    creates_order = request.sale_mode is SaleMode.SELL_ORDER or (
        request.acquisition_mode is AcquisitionMode.BUY_ORDER
        and any(need.quantity > 0 for need in needs)
    )
    warnings = ordered_warnings(
        *(quote.warnings for quote in quote_results),
        sale_quote.warnings,
        [CraftWarning.ORDER_NOT_GUARANTEED] if creates_order else [],
    )
    unavailable_reason = structural_reason or (
        None if available else _reason(quote_results, sale_quote)
    )
    return {
        "route": route,
        "available": available,
        "unavailable_reason": unavailable_reason,
        "executions": executions,
        "produced_quantity": produced_quantity,
        "surplus_quantity": surplus_quantity,
        "focus_consumed": focus_consumed,
        "costs": {
            "ready_item_cost": category_costs.get("ready_item") if acquisition_complete else None,
            "ingredient_cost": category_costs.get("ingredient") if acquisition_complete else None,
            "upgrade_resource_cost": (
                category_costs.get("upgrade_resource") if acquisition_complete else None
            ),
            "recipe_silver_cost": recipe_silver_cost,
            "station_cost": station_cost,
            "acquisition_setup_fee": setup_fee,
            "total_cost": total_cost,
        },
        "acquisition_quotes": quote_rows,
        "upgrade_steps": upgrade_steps,
        "sale_quote": sale_quote.payload,
        "net_revenue": net_revenue,
        "profit": profit,
        "profit_per_unit": profit_per_unit,
        "roi": roi,
        "warnings": warnings,
    }


async def compare_craft(
    session: AsyncSession,
    request: CraftCompareRequest,
    user_id: uuid.UUID,
) -> dict:
    locations = await list_eligible_craft_locations(session)
    family = await get_recipe_family(session, request.output_item)
    # Base da taxa da estação (task 4/18). Uma consulta para a família toda: a rota direta e a
    # de upgrade produzem itens diferentes, com valores diferentes.
    item_values = await get_item_values(
        session, [recipe.output_item_unique_name for recipe in family.values()]
    )
    target_recipe = family[max(family)]
    target_level = target_recipe.enchantment_level
    base_recipe = family.get(0)

    allowed_price_ids = {request.output_item}
    allowed_ingredient_ids = set()
    for recipe in family.values():
        ingredient_ids = {ingredient.ingredient_unique_name for ingredient in recipe.ingredients}
        allowed_price_ids.update(ingredient_ids)
        allowed_ingredient_ids.update(ingredient_ids)
        if recipe.upgrade_resource_unique_name:
            allowed_price_ids.add(recipe.upgrade_resource_unique_name)
            allowed_ingredient_ids.add(recipe.upgrade_resource_unique_name)
    unknown = (set(request.manual_prices) - allowed_price_ids) | (
        set(request.ingredient_overrides) - allowed_ingredient_ids
    )
    if unknown:
        raise InvalidOverrideError(",".join(sorted(unknown)))

    direct_production = calculate_production(request.quantity, target_recipe.amount_crafted)
    direct_needs = _ingredient_needs(target_recipe, direct_production.executions, request)

    base_reason = None
    base_production = None
    base_needs: list[AcquisitionNeed] = []
    upgrade_steps = []
    if target_level == 0:
        base_reason = "item_sem_encantamento"
    elif base_recipe is None:
        base_reason = "receita_base_indisponivel"
    else:
        base_production = calculate_production(request.quantity, base_recipe.amount_crafted)
        base_needs = _ingredient_needs(base_recipe, base_production.executions, request)
        for level in range(1, target_level + 1):
            step_recipe = family.get(level)
            if step_recipe is None:
                base_reason = f"receita_upgrade_nivel_{level}_indisponivel"
                break
            if (
                step_recipe.upgrade_resource_unique_name is None
                or step_recipe.upgrade_resource_count is None
            ):
                base_reason = f"recurso_upgrade_nivel_{level}_indisponivel"
                break
            resource_id = step_recipe.upgrade_resource_unique_name
            override = request.ingredient_overrides.get(resource_id)
            quality = override.quality_level if override is not None else 1
            quantity = step_recipe.upgrade_resource_count * base_production.produced_quantity
            enchantment = (
                int(resource_id.rpartition("@")[2])
                if resource_id.rpartition("@")[2].isdigit()
                else 0
            )
            base_needs.append(
                AcquisitionNeed(resource_id, quality, enchantment, quantity, "upgrade_resource")
            )
            upgrade_steps.append(
                {
                    "from_level": level - 1,
                    "to_level": level,
                    "resource_item": resource_id,
                    "resource_count_per_item": step_recipe.upgrade_resource_count,
                    "quantity": quantity,
                }
            )

    city_ids = [location["location_id"] for location in locations]
    all_need_shapes = {
        (need.item_id, need.quality_level, need.enchantment_level)
        for need in direct_needs + base_needs
    }
    all_need_shapes.add((request.output_item, request.output_quality, target_level))
    combos = [
        (item, city_id, quality, enchantment)
        for city_id in city_ids
        for item, quality, enchantment in all_need_shapes
    ]
    policy = get_market_book_policy()
    coverage = await query_book_coverage(
        session,
        request.server.value,
        combos,
        user_id=user_id if request.scope == "mine" else None,
    )
    levels = await query_executable_book_levels(
        session,
        request.server.value,
        combos if request.scope == "all" else [combo for combo in combos if combo in coverage],
        policy.freshness_hours,
    )
    if request.scope == "all":
        coverage.update(
            (level.item_id, level.location_id, level.quality_level, level.enchantment_level)
            for level in levels
        )
    levels_by_combo: dict[tuple[str, str, int, int], list[ExecutableBookLevel]] = defaultdict(list)
    for level in levels:
        levels_by_combo[
            (level.item_id, level.location_id, level.quality_level, level.enchantment_level)
        ].append(level)

    sales_tax_rate, setup_fee_rate = _rates(request)
    cities = []
    for location in locations:
        city_id = location["location_id"]
        ready_need = AcquisitionNeed(
            request.output_item,
            request.output_quality,
            target_level,
            request.quantity,
            "ready_item",
        )
        ready_route = _build_route(
            route="buy_ready",
            request=request,
            location_id=city_id,
            needs=[ready_need],
            executions=0,
            produced_quantity=request.quantity,
            surplus_quantity=0,
            focus_consumed=0,
            recipe_silver_cost=Decimal("0"),
            station_cost=Decimal("0"),
            upgrade_steps=[],
            levels_by_combo=levels_by_combo,
            coverage=coverage,
            output_enchantment=target_level,
            sales_tax_rate=sales_tax_rate,
            setup_fee_rate=setup_fee_rate,
        )
        direct_route = _build_route(
            route="craft_direct",
            request=request,
            location_id=city_id,
            needs=direct_needs,
            executions=direct_production.executions,
            produced_quantity=direct_production.produced_quantity,
            surplus_quantity=direct_production.surplus_quantity,
            focus_consumed=calculate_focus_consumed(
                target_recipe.crafting_focus,
                direct_production.executions,
                use_focus=request.use_focus,
            ),
            recipe_silver_cost=Decimal(target_recipe.silver_cost * direct_production.executions),
            station_cost=calculate_station_fee(
                item_values.get(target_recipe.output_item_unique_name),
                request.station_fee_per_100_nutrition,
                direct_production.executions,
            ),
            upgrade_steps=[],
            levels_by_combo=levels_by_combo,
            coverage=coverage,
            output_enchantment=target_level,
            sales_tax_rate=sales_tax_rate,
            setup_fee_rate=setup_fee_rate,
        )
        base_quantity = base_production.produced_quantity if base_production is not None else 0
        base_route = _build_route(
            route="base_upgrade",
            request=request,
            location_id=city_id,
            needs=base_needs,
            executions=base_production.executions if base_production is not None else 0,
            produced_quantity=base_quantity,
            surplus_quantity=base_production.surplus_quantity if base_production is not None else 0,
            focus_consumed=(
                calculate_focus_consumed(
                    base_recipe.crafting_focus,
                    base_production.executions,
                    use_focus=request.use_focus,
                )
                if base_recipe is not None and base_production is not None
                else 0
            ),
            recipe_silver_cost=(
                Decimal(base_recipe.silver_cost * base_production.executions)
                if base_recipe is not None and base_production is not None
                else Decimal("0")
            ),
            station_cost=(
                calculate_station_fee(
                    item_values.get(base_recipe.output_item_unique_name),
                    request.station_fee_per_100_nutrition,
                    base_production.executions,
                )
                if base_recipe is not None and base_production is not None
                else Decimal("0")
            ),
            upgrade_steps=upgrade_steps,
            levels_by_combo=levels_by_combo,
            coverage=coverage,
            output_enchantment=target_level,
            sales_tax_rate=sales_tax_rate,
            setup_fee_rate=setup_fee_rate,
            structural_reason=base_reason,
        )
        routes = [ready_route, direct_route, base_route]
        valid = [route for route in routes if route["available"]]
        best = min(valid, key=lambda route: route["costs"]["total_cost"]) if valid else None
        cities.append(
            {
                "location_id": city_id,
                "location_name": location["name"],
                "routes": routes,
                "best_route": best["route"] if best else None,
                "profit": best["profit"] if best else None,
                "roi": best["roi"] if best else None,
            }
        )

    ranked = sorted(
        (city for city in cities if city["best_route"] is not None),
        key=lambda city: (city["profit"], city["location_name"]),
        reverse=True,
    )
    unavailable = [city for city in cities if city["best_route"] is None]
    return {
        "server": request.server,
        "output_item": request.output_item,
        "output_quality": request.output_quality,
        "scope": request.scope,
        "requested_quantity": request.quantity,
        "acquisition_mode": request.acquisition_mode,
        "sale_mode": request.sale_mode,
        "same_city_only": True,
        "transport_included": False,
        "sales_tax_rate": sales_tax_rate,
        "setup_fee_rate": setup_fee_rate,
        "ranked_cities": ranked,
        "unavailable_cities": unavailable,
    }
