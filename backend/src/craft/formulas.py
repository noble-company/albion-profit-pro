"""Pure formulas from ``docs/11-formulas-de-craft.md``.

This module deliberately has no database or market-data dependencies. Task 04 composes these
primitives with executable order-book quotes.
"""

from dataclasses import dataclass
from decimal import ROUND_CEILING, ROUND_FLOOR, Decimal

from src.craft.constants import (
    DISPLAY_DECIMAL_PLACES,
    NUTRITION_FEE_BASIS,
    NUTRITION_PER_ITEM_VALUE,
    AcquisitionMode,
    SaleMode,
)


@dataclass(frozen=True, slots=True)
class Production:
    executions: int
    produced_quantity: int
    surplus_quantity: int


@dataclass(frozen=True, slots=True)
class IngredientRequirement:
    gross_quantity: int
    expected_return_quantity: Decimal
    effective_quantity: Decimal
    purchase_quantity: int


@dataclass(frozen=True, slots=True)
class AcquisitionCost:
    quoted_cost: Decimal
    setup_fee: Decimal
    total_cost: Decimal


@dataclass(frozen=True, slots=True)
class SaleRevenue:
    gross_revenue: Decimal
    setup_fee: Decimal
    sales_tax: Decimal
    net_revenue: Decimal


@dataclass(frozen=True, slots=True)
class FinancialResult:
    profit: Decimal
    profit_per_unit: Decimal
    roi: Decimal | None


def _require_decimal(value: Decimal, name: str) -> None:
    if not isinstance(value, Decimal):
        raise TypeError(f"{name} must be Decimal")


def _validate_non_negative(value: Decimal, name: str) -> None:
    _require_decimal(value, name)
    if value < 0:
        raise ValueError(f"{name} must be non-negative")


def _validate_rate(rate: Decimal, name: str) -> None:
    _require_decimal(rate, name)
    if not Decimal("0") <= rate <= Decimal("1"):
        raise ValueError(f"{name} must be between 0 and 1")


def ceil_decimal(value: Decimal) -> int:
    """Round a non-negative Decimal up to a purchasable whole unit."""

    _validate_non_negative(value, "value")
    return int(value.to_integral_value(rounding=ROUND_CEILING))


def round_down_for_display(
    value: Decimal,
    decimal_places: int = DISPLAY_DECIMAL_PLACES,
) -> Decimal:
    """Truncate a value for presentation without changing calculation precision.

    The returned value must never be fed back into financial formulas or ROI thresholds.
    """

    _require_decimal(value, "value")
    if decimal_places < 0:
        raise ValueError("decimal_places must be non-negative")
    quantum = Decimal("1").scaleb(-decimal_places)
    return value.quantize(quantum, rounding=ROUND_FLOOR)


def calculate_production(desired_quantity: int, amount_crafted: int) -> Production:
    if desired_quantity <= 0:
        raise ValueError("desired_quantity must be positive")
    if amount_crafted <= 0:
        raise ValueError("amount_crafted must be positive")

    executions = (desired_quantity + amount_crafted - 1) // amount_crafted
    produced_quantity = executions * amount_crafted
    return Production(
        executions=executions,
        produced_quantity=produced_quantity,
        surplus_quantity=produced_quantity - desired_quantity,
    )


def calculate_ingredient_requirement(
    count_per_execution: int,
    executions: int,
    return_rate: Decimal,
    *,
    return_eligible: bool = True,
) -> IngredientRequirement:
    """Calculate expected consumption and the whole quantity that must be acquired.

    Eligibility is explicit so item-name heuristics cannot silently change the calculation.
    """

    if count_per_execution < 0:
        raise ValueError("count_per_execution must be non-negative")
    if executions < 0:
        raise ValueError("executions must be non-negative")
    _validate_rate(return_rate, "return_rate")

    gross_quantity = count_per_execution * executions
    applied_rate = return_rate if return_eligible else Decimal("0")
    effective_quantity = Decimal(gross_quantity) * (Decimal("1") - applied_rate)
    expected_return_quantity = Decimal(gross_quantity) - effective_quantity
    return IngredientRequirement(
        gross_quantity=gross_quantity,
        expected_return_quantity=expected_return_quantity,
        effective_quantity=effective_quantity,
        purchase_quantity=ceil_decimal(effective_quantity),
    )


def calculate_focus_consumed(crafting_focus: int, executions: int, *, use_focus: bool) -> int:
    if crafting_focus < 0:
        raise ValueError("crafting_focus must be non-negative")
    if executions < 0:
        raise ValueError("executions must be non-negative")
    return crafting_focus * executions if use_focus else 0


def calculate_station_fee(
    item_value: Decimal | None, fee_per_100_nutrition: Decimal, executions: int
) -> Decimal:
    """Silver charged by the crafting station for `executions` runs of a recipe.

    The game does not charge a flat amount per run: it charges per **nutrition consumed**, and
    each recipe consumes an amount derived from the item's value
    (`nutrition = item_value × 0.1125`). A T4 refined resource and a T8 weapon differ by three
    orders of magnitude, so no single per-run number can be right for both.

    An ingredient without value already counts as zero in the derived value (task 4/13, measured
    at the in-game station), so `item_value` is `None` only for an item with no published value
    and no recipe — the fireworks, which have no ingredients. Charging an invented fee there would
    be worse than charging none.

    Not rounded on purpose: where the game rounds a partial silver (it shows 28 for 28.08) is
    not established, and inventing a rule would fake precision the measurement does not have.
    """
    _validate_non_negative(fee_per_100_nutrition, "fee_per_100_nutrition")
    if item_value is None or executions <= 0:
        return Decimal("0")
    _validate_non_negative(item_value, "item_value")

    nutrition = item_value * NUTRITION_PER_ITEM_VALUE
    fee = nutrition * fee_per_100_nutrition / NUTRITION_FEE_BASIS * executions
    # A cadeia de multiplicações acumula casas (`28.08000000`). O valor é o mesmo, mas o fio
    # carrega dinheiro como string decimal (`F09`) e o zero à direita vira ruído no contrato —
    # e faria a string do servidor divergir da do cliente nos vetores dourados.
    return fee.quantize(Decimal(1)) if fee == fee.to_integral_value() else fee.normalize()


def calculate_percentage_charge(base: Decimal, rate: Decimal) -> Decimal:
    """Calculate one silver charge, rounded up independently."""

    _validate_non_negative(base, "base")
    _validate_rate(rate, "rate")
    return Decimal(ceil_decimal(base * rate))


def calculate_acquisition_cost(
    quoted_cost: Decimal,
    mode: AcquisitionMode,
    setup_fee_rate: Decimal,
) -> AcquisitionCost:
    _validate_non_negative(quoted_cost, "quoted_cost")
    _validate_rate(setup_fee_rate, "setup_fee_rate")
    setup_fee = (
        calculate_percentage_charge(quoted_cost, setup_fee_rate)
        if mode is AcquisitionMode.BUY_ORDER
        else Decimal("0")
    )
    return AcquisitionCost(
        quoted_cost=quoted_cost,
        setup_fee=setup_fee,
        total_cost=quoted_cost + setup_fee,
    )


def calculate_sale_revenue(
    gross_revenue: Decimal,
    mode: SaleMode,
    sales_tax_rate: Decimal,
    setup_fee_rate: Decimal,
) -> SaleRevenue:
    _validate_non_negative(gross_revenue, "gross_revenue")
    _validate_rate(sales_tax_rate, "sales_tax_rate")
    _validate_rate(setup_fee_rate, "setup_fee_rate")
    sales_tax = calculate_percentage_charge(gross_revenue, sales_tax_rate)
    setup_fee = (
        calculate_percentage_charge(gross_revenue, setup_fee_rate)
        if mode is SaleMode.SELL_ORDER
        else Decimal("0")
    )
    return SaleRevenue(
        gross_revenue=gross_revenue,
        setup_fee=setup_fee,
        sales_tax=sales_tax,
        net_revenue=gross_revenue - setup_fee - sales_tax,
    )


def calculate_financial_result(
    total_cost: Decimal,
    net_revenue: Decimal,
    produced_quantity: int,
) -> FinancialResult:
    _validate_non_negative(total_cost, "total_cost")
    _require_decimal(net_revenue, "net_revenue")
    if produced_quantity <= 0:
        raise ValueError("produced_quantity must be positive")

    profit = net_revenue - total_cost
    return FinancialResult(
        profit=profit,
        profit_per_unit=profit / Decimal(produced_quantity),
        roi=None if total_cost == 0 else profit / total_cost,
    )
