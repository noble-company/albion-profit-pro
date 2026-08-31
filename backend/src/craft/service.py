import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from src.craft.constants import (
    DEFAULT_NON_PREMIUM_SALES_TAX_RATE,
    DEFAULT_PREMIUM_SALES_TAX_RATE,
    DEFAULT_SETUP_FEE_RATE,
    AcquisitionMode,
    CraftWarning,
    SaleMode,
)
from src.craft.formulas import (
    calculate_acquisition_cost,
    calculate_financial_result,
    calculate_focus_consumed,
    calculate_ingredient_requirement,
    calculate_production,
    calculate_sale_revenue,
)
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


@dataclass(frozen=True, slots=True)
class QuoteResult:
    payload: dict
    complete: bool
    warnings: tuple[CraftWarning, ...]


_WARNING_ORDER = {
    warning: index
    for index, warning in enumerate(
        (
            CraftWarning.NO_COVERAGE,
            CraftWarning.STALE_DATA,
            CraftWarning.NO_PRICE,
            CraftWarning.INSUFFICIENT_DEPTH,
            CraftWarning.ORDER_NOT_GUARANTEED,
        )
    )
}


def _ordered_warnings(*groups: tuple[CraftWarning, ...] | list[CraftWarning]) -> list[CraftWarning]:
    warnings = {warning for group in groups for warning in group}
    return sorted(warnings, key=_WARNING_ORDER.__getitem__)


def _empty_quote(
    quantity: int,
    warning: CraftWarning,
    *,
    guaranteed: bool,
) -> QuoteResult:
    return QuoteResult(
        payload={
            "requested_quantity": quantity,
            "priced_quantity": 0,
            "unit_price": None,
            "total": None,
            "complete": False,
            "guaranteed": guaranteed,
            "source": None,
            "levels": [],
            "warnings": [warning],
            "oldest_observed_at": None,
            "age_seconds": None,
        },
        complete=False,
        warnings=(warning,),
    )


def _manual_quote(quantity: int, unit_price: Decimal, *, guaranteed: bool) -> QuoteResult:
    total = unit_price * quantity
    return QuoteResult(
        payload={
            "requested_quantity": quantity,
            "priced_quantity": quantity,
            "unit_price": unit_price,
            "total": total,
            "complete": True,
            "guaranteed": guaranteed,
            "source": "manual",
            "levels": [{"unit_price": unit_price, "quantity": quantity, "subtotal": total}],
            "warnings": [],
            "oldest_observed_at": None,
            "age_seconds": None,
        },
        complete=True,
        warnings=(),
    )


def _zero_quote(*, guaranteed: bool) -> QuoteResult:
    return QuoteResult(
        payload={
            "requested_quantity": 0,
            "priced_quantity": 0,
            "unit_price": None,
            "total": Decimal("0"),
            "complete": True,
            "guaranteed": guaranteed,
            "source": None,
            "levels": [],
            "warnings": [],
            "oldest_observed_at": None,
            "age_seconds": None,
        },
        complete=True,
        warnings=(),
    )


def _sorted_fresh_levels(
    levels: list[ExecutableBookLevel],
    auction_type: str,
) -> list[ExecutableBookLevel]:
    fresh = [level for level in levels if level.auction_type == auction_type and level.amount > 0]
    return sorted(
        fresh,
        key=lambda level: level.unit_price,
        reverse=auction_type == "request",
    )


def _has_stale_side(levels: list[ExecutableBookLevel], auction_type: str) -> bool:
    return any(level.auction_type == auction_type and level.amount == 0 for level in levels)


def _immediate_book_quote(
    quantity: int,
    auction_type: str,
    levels: list[ExecutableBookLevel],
    *,
    covered: bool,
) -> QuoteResult:
    if not covered:
        return _empty_quote(quantity, CraftWarning.NO_COVERAGE, guaranteed=True)

    fresh_levels = _sorted_fresh_levels(levels, auction_type)
    stale_side = _has_stale_side(levels, auction_type)
    if not fresh_levels:
        warning = CraftWarning.STALE_DATA if stale_side else CraftWarning.NO_PRICE
        return _empty_quote(quantity, warning, guaranteed=True)

    remaining = quantity
    filled = 0
    total = Decimal("0")
    consumed_levels = []
    observed_at_values = []
    for level in fresh_levels:
        if remaining == 0:
            break
        consumed = min(remaining, level.amount)
        subtotal = level.unit_price * consumed
        consumed_levels.append(
            {
                "unit_price": level.unit_price,
                "quantity": consumed,
                "subtotal": subtotal,
                "observed_at": level.latest_seen_at,
            }
        )
        observed_at_values.append(level.latest_seen_at)
        total += subtotal
        filled += consumed
        remaining -= consumed

    complete = remaining == 0
    warnings = []
    if not complete:
        warnings.append(CraftWarning.INSUFFICIENT_DEPTH)
        if stale_side:
            warnings.append(CraftWarning.STALE_DATA)
    ordered = _ordered_warnings(warnings)
    oldest_observed_at = min(observed_at_values) if observed_at_values else None
    return QuoteResult(
        payload={
            "requested_quantity": quantity,
            "priced_quantity": filled,
            "unit_price": total / filled if filled else None,
            "total": total if filled else None,
            "complete": complete,
            "guaranteed": True,
            "source": "book",
            "levels": consumed_levels,
            "warnings": ordered,
            "oldest_observed_at": oldest_observed_at,
            "age_seconds": _quote_age_seconds(oldest_observed_at),
        },
        complete=complete,
        warnings=tuple(ordered),
    )


def _order_quote(
    quantity: int,
    auction_type: str,
    levels: list[ExecutableBookLevel],
    *,
    covered: bool,
) -> QuoteResult:
    if not covered:
        return _empty_quote(quantity, CraftWarning.NO_COVERAGE, guaranteed=False)

    fresh_levels = _sorted_fresh_levels(levels, auction_type)
    if not fresh_levels:
        warning = (
            CraftWarning.STALE_DATA
            if _has_stale_side(levels, auction_type)
            else CraftWarning.NO_PRICE
        )
        return _empty_quote(quantity, warning, guaranteed=False)

    best = fresh_levels[0]
    total = best.unit_price * quantity
    return QuoteResult(
        payload={
            "requested_quantity": quantity,
            "priced_quantity": quantity,
            "unit_price": best.unit_price,
            "total": total,
            "complete": True,
            "guaranteed": False,
            "source": "book_suggestion",
            "levels": [
                {
                    "unit_price": best.unit_price,
                    "quantity": quantity,
                    "subtotal": total,
                    "observed_at": best.latest_seen_at,
                }
            ],
            "warnings": [],
            "oldest_observed_at": best.latest_seen_at,
            "age_seconds": _quote_age_seconds(best.latest_seen_at),
        },
        complete=True,
        warnings=(),
    )


def _quote_age_seconds(observed_at: datetime | None) -> int | None:
    if observed_at is None:
        return None
    return max(0, int((datetime.now(timezone.utc) - observed_at).total_seconds()))


def _quote(
    quantity: int,
    auction_type: str,
    levels: list[ExecutableBookLevel],
    manual_price: Decimal | None,
    *,
    covered: bool,
    order: bool,
) -> QuoteResult:
    if quantity == 0:
        return _zero_quote(guaranteed=True)
    if manual_price is not None:
        return _manual_quote(quantity, manual_price, guaranteed=False)
    if order:
        return _order_quote(quantity, auction_type, levels, covered=covered)
    return _immediate_book_quote(quantity, auction_type, levels, covered=covered)


def _manual_side(request: CraftSimulationRequest, item_id: str, side: str) -> Decimal | None:
    override = request.manual_prices.get(item_id)
    return getattr(override, side) if override is not None else None


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
    scenario_warnings = _ordered_warnings(
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
            DEFAULT_PREMIUM_SALES_TAX_RATE
            if request.premium
            else DEFAULT_NON_PREMIUM_SALES_TAX_RATE
        )
    )
    setup_fee_rate = (
        request.setup_fee_rate if request.setup_fee_rate is not None else DEFAULT_SETUP_FEE_RATE
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
        immediate_quote = _quote(
            requirement.purchase_quantity,
            "offer",
            combo_levels,
            _manual_side(request, ingredient["unique_name"], "offer"),
            covered=combo in coverage,
            order=False,
        )
        order_quote = _quote(
            requirement.purchase_quantity,
            "request",
            combo_levels,
            _manual_side(request, ingredient["unique_name"], "request"),
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
    immediate_sale = _quote(
        production.produced_quantity,
        "request",
        output_levels,
        _manual_side(request, request.output_item, "request"),
        covered=output_combo in coverage,
        order=False,
    )
    sell_order = _quote(
        production.produced_quantity,
        "offer",
        output_levels,
        _manual_side(request, request.output_item, "offer"),
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
