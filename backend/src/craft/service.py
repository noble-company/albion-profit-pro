import uuid
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
)
from src.craft.quotes import QuoteResult, manual_side, ordered_warnings, quote
from src.craft.schemas import CraftSimulationRequest
from src.prices.policy import get_market_book_policy
from src.prices.service import (
    ExecutableBookLevel,
    query_book_coverage,
    query_executable_book_levels,
)
from src.recipes.service import get_recipe_detail


class InvalidOverrideError(ValueError):
    pass


def _build_scenario(
    ingredient_rows: list[dict],
    output_quote: QuoteResult,
    acquisition_mode: AcquisitionMode,
    sale_mode: SaleMode,
    recipe_silver_cost: Decimal,
    station_cost: Decimal,
    produced_quantity: int,
    sales_tax_rate: Decimal,
    setup_fee_rate: Decimal,
) -> dict:
    quote_key = (
        "immediate_quote" if acquisition_mode is AcquisitionMode.IMMEDIATE else "order_quote"
    )
    acquisition_quotes = [row[quote_key] for row in ingredient_rows]
    acquisition_complete = all(quote.complete for quote in acquisition_quotes)

    ingredient_cost = None
    acquisition_setup_fee = None
    total_cost = None
    if acquisition_complete:
        ingredient_cost = sum(
            (quote.payload["total"] for quote in acquisition_quotes),
            start=Decimal("0"),
        )
        acquisition_parts = [
            calculate_acquisition_cost(quote.payload["total"], acquisition_mode, setup_fee_rate)
            for quote in acquisition_quotes
        ]
        acquisition_setup_fee = sum(
            (part.setup_fee for part in acquisition_parts), start=Decimal("0")
        )
        total_cost = ingredient_cost + acquisition_setup_fee + recipe_silver_cost + station_cost

    revenue = {
        "gross_revenue": None,
        "sales_tax": None,
        "sale_setup_fee": None,
        "net_revenue": None,
    }
    if output_quote.complete:
        sale = calculate_sale_revenue(
            output_quote.payload["total"], sale_mode, sales_tax_rate, setup_fee_rate
        )
        revenue = {
            "gross_revenue": sale.gross_revenue,
            "sales_tax": sale.sales_tax,
            "sale_setup_fee": sale.setup_fee,
            "net_revenue": sale.net_revenue,
        }

    profit = None
    profit_per_unit = None
    roi = None
    if total_cost is not None and revenue["net_revenue"] is not None:
        result = calculate_financial_result(total_cost, revenue["net_revenue"], produced_quantity)
        profit = result.profit
        profit_per_unit = result.profit_per_unit
        roi = result.roi

    creates_order = sale_mode is SaleMode.SELL_ORDER or (
        acquisition_mode is AcquisitionMode.BUY_ORDER
        and any(quote.payload["requested_quantity"] > 0 for quote in acquisition_quotes)
    )
    scenario_warnings = ordered_warnings(
        *(quote.warnings for quote in acquisition_quotes),
        output_quote.warnings,
        [CraftWarning.ORDER_NOT_GUARANTEED] if creates_order else [],
    )
    return {
        "acquisition_mode": acquisition_mode,
        "sale_mode": sale_mode,
        "costs": {
            "ingredient_cost": ingredient_cost,
            "recipe_silver_cost": recipe_silver_cost,
            "station_cost": station_cost,
            "upgrade_cost": Decimal("0"),
            "acquisition_setup_fee": acquisition_setup_fee,
            "total_cost": total_cost,
        },
        "revenue": revenue,
        "profit": profit,
        "profit_per_unit": profit_per_unit,
        "roi": roi,
        "warnings": scenario_warnings,
    }


async def simulate_craft(
    session: AsyncSession,
    request: CraftSimulationRequest,
    user_id: uuid.UUID,
    *,
    freshness_hours: int | None = None,
) -> dict:
    recipe = await get_recipe_detail(session, request.output_item)
    ingredient_ids = {ingredient["unique_name"] for ingredient in recipe["ingredients"]}
    allowed_price_ids = ingredient_ids | {request.output_item}
    unknown_ingredient_overrides = set(request.ingredient_overrides) - ingredient_ids
    unknown_price_overrides = set(request.manual_prices) - allowed_price_ids
    if unknown_ingredient_overrides or unknown_price_overrides:
        invalid = sorted(unknown_ingredient_overrides | unknown_price_overrides)
        raise InvalidOverrideError(",".join(invalid))

    production = calculate_production(request.quantity, recipe["amount_crafted"])
    sales_tax_rate = (
        request.sales_tax_rate
        if request.sales_tax_rate is not None
        else (
            constants.DEFAULT_PREMIUM_SALES_TAX_RATE
            if request.premium
            else constants.DEFAULT_NON_PREMIUM_SALES_TAX_RATE
        )
    )
    setup_fee_rate = (
        request.setup_fee_rate
        if request.setup_fee_rate is not None
        else constants.DEFAULT_SETUP_FEE_RATE
    )

    ingredient_rows = []
    combos = []
    for ingredient in recipe["ingredients"]:
        override = request.ingredient_overrides.get(ingredient["unique_name"])
        quality_level = override.quality_level if override is not None else 1
        return_eligible = override.return_eligible if override is not None else True
        requirement = calculate_ingredient_requirement(
            ingredient["count"],
            production.executions,
            request.return_rate,
            return_eligible=return_eligible,
        )
        combo = (
            ingredient["unique_name"],
            request.location_id,
            quality_level,
            ingredient["enchantment_level"],
        )
        combos.append(combo)
        ingredient_rows.append(
            {
                "ingredient": ingredient,
                "quality_level": quality_level,
                "return_eligible": return_eligible,
                "requirement": requirement,
                "combo": combo,
            }
        )

    output_combo = (
        request.output_item,
        request.location_id,
        request.output_quality,
        recipe["enchantment_level"],
    )
    combos.append(output_combo)
    unique_combos = list(dict.fromkeys(combos))
    policy = get_market_book_policy()
    effective_freshness_hours = (
        freshness_hours if freshness_hours is not None else policy.freshness_hours
    )
    coverage = await query_book_coverage(
        session,
        request.server.value,
        unique_combos,
        user_id=user_id if request.scope == "mine" else None,
    )
    levels = await query_executable_book_levels(
        session,
        request.server.value,
        unique_combos if request.scope == "all" else [c for c in unique_combos if c in coverage],
        effective_freshness_hours,
    )
    if request.scope == "all":
        coverage.update(
            (level.item_id, level.location_id, level.quality_level, level.enchantment_level)
            for level in levels
        )

    levels_by_combo: dict[tuple[str, str, int, int], list[ExecutableBookLevel]] = {
        combo: [] for combo in unique_combos
    }
    for level in levels:
        key = (level.item_id, level.location_id, level.quality_level, level.enchantment_level)
        levels_by_combo.setdefault(key, []).append(level)

    public_ingredients = []
    for row in ingredient_rows:
        ingredient = row["ingredient"]
        requirement = row["requirement"]
        combo = row["combo"]
        combo_levels = levels_by_combo.get(combo, [])
        immediate_quote = quote(
            requirement.purchase_quantity,
            "offer",
            combo_levels,
            manual_side(request.manual_prices, ingredient["unique_name"], "offer"),
            covered=combo in coverage,
            order=False,
        )
        order_quote = quote(
            requirement.purchase_quantity,
            "request",
            combo_levels,
            manual_side(request.manual_prices, ingredient["unique_name"], "request"),
            covered=combo in coverage,
            order=True,
        )
        row["immediate_quote"] = immediate_quote
        row["order_quote"] = order_quote
        public_ingredients.append(
            {
                "position": ingredient["position"],
                "unique_name": ingredient["unique_name"],
                "quality_level": row["quality_level"],
                "count_per_execution": ingredient["count"],
                "return_eligible": row["return_eligible"],
                "gross_quantity": requirement.gross_quantity,
                "expected_return_quantity": requirement.expected_return_quantity,
                "effective_quantity": requirement.effective_quantity,
                "purchase_quantity": requirement.purchase_quantity,
                "immediate_purchase": immediate_quote.payload,
                "buy_order": order_quote.payload,
            }
        )

    output_levels = levels_by_combo.get(output_combo, [])
    immediate_sale = quote(
        production.produced_quantity,
        "request",
        output_levels,
        manual_side(request.manual_prices, request.output_item, "request"),
        covered=output_combo in coverage,
        order=False,
    )
    sell_order = quote(
        production.produced_quantity,
        "offer",
        output_levels,
        manual_side(request.manual_prices, request.output_item, "offer"),
        covered=output_combo in coverage,
        order=True,
    )

    recipe_silver_cost = Decimal(recipe["silver_cost"] * production.executions)
    station_cost = request.station_cost_per_execution * production.executions
    scenarios = [
        _build_scenario(
            ingredient_rows,
            immediate_sale if sale_mode is SaleMode.IMMEDIATE else sell_order,
            acquisition_mode,
            sale_mode,
            recipe_silver_cost,
            station_cost,
            production.produced_quantity,
            sales_tax_rate,
            setup_fee_rate,
        )
        for acquisition_mode in (AcquisitionMode.IMMEDIATE, AcquisitionMode.BUY_ORDER)
        for sale_mode in (SaleMode.IMMEDIATE, SaleMode.SELL_ORDER)
    ]

    return {
        "server": request.server,
        "output_item": request.output_item,
        "location_id": request.location_id,
        "output_quality": request.output_quality,
        "scope": request.scope,
        "requested_quantity": request.quantity,
        "executions": production.executions,
        "produced_quantity": production.produced_quantity,
        "surplus_quantity": production.surplus_quantity,
        "return_rate": request.return_rate,
        "focus_consumed": calculate_focus_consumed(
            recipe["crafting_focus"], production.executions, use_focus=request.use_focus
        ),
        "premium": request.premium,
        "sales_tax_rate": sales_tax_rate,
        "setup_fee_rate": setup_fee_rate,
        "recipe": {
            "silver_cost_per_execution": recipe["silver_cost"],
            "crafting_focus_per_execution": recipe["crafting_focus"],
            "amount_crafted": recipe["amount_crafted"],
        },
        "ingredients": public_ingredients,
        "output_quotes": {
            "immediate_sale": immediate_sale.payload,
            "sell_order": sell_order.payload,
        },
        "scenarios": scenarios,
    }
