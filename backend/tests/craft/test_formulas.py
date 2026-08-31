from decimal import Decimal

import pytest

from src.craft.constants import (
    DEFAULT_NON_PREMIUM_SALES_TAX_RATE,
    DEFAULT_PREMIUM_SALES_TAX_RATE,
    DEFAULT_SETUP_FEE_RATE,
    AcquisitionMode,
    SaleMode,
)
from src.craft.formulas import (
    calculate_acquisition_cost,
    calculate_financial_result,
    calculate_focus_consumed,
    calculate_ingredient_requirement,
    calculate_production,
    calculate_sale_revenue,
    round_down_for_display,
)


def test_production_rounds_executions_up_and_exposes_surplus() -> None:
    production = calculate_production(desired_quantity=11, amount_crafted=5)

    assert production.executions == 3
    assert production.produced_quantity == 15
    assert production.surplus_quantity == 4


def test_return_keeps_expected_decimal_but_rounds_purchase_quantity_up() -> None:
    requirement = calculate_ingredient_requirement(
        count_per_execution=3,
        executions=3,
        return_rate=Decimal("0.15"),
    )

    assert requirement.gross_quantity == 9
    assert requirement.expected_return_quantity == Decimal("1.35")
    assert requirement.effective_quantity == Decimal("7.65")
    assert requirement.purchase_quantity == 8


def test_return_exception_is_explicit_and_not_inferred_from_item_name() -> None:
    requirement = calculate_ingredient_requirement(
        count_per_execution=2,
        executions=4,
        return_rate=Decimal("0.40"),
        return_eligible=False,
    )

    assert requirement.expected_return_quantity == 0
    assert requirement.effective_quantity == 8
    assert requirement.purchase_quantity == 8


def test_focus_toggle_does_not_change_return_rate() -> None:
    requirement = calculate_ingredient_requirement(1, 10, Decimal("0.15"))

    assert calculate_focus_consumed(18, 10, use_focus=True) == 180
    assert calculate_focus_consumed(18, 10, use_focus=False) == 0
    assert requirement.effective_quantity == Decimal("8.50")


def test_immediate_purchase_has_no_setup_and_buy_order_uses_default() -> None:
    immediate = calculate_acquisition_cost(
        Decimal("810"), AcquisitionMode.IMMEDIATE, DEFAULT_SETUP_FEE_RATE
    )
    order = calculate_acquisition_cost(
        Decimal("810"), AcquisitionMode.BUY_ORDER, DEFAULT_SETUP_FEE_RATE
    )

    assert immediate.setup_fee == 0
    assert immediate.total_cost == 810
    assert order.setup_fee == 21  # ceil(810 * 2.5%)
    assert order.total_cost == 831


def test_sale_charges_tax_always_and_setup_only_for_sell_order() -> None:
    immediate = calculate_sale_revenue(
        Decimal("1500"),
        SaleMode.IMMEDIATE,
        DEFAULT_PREMIUM_SALES_TAX_RATE,
        DEFAULT_SETUP_FEE_RATE,
    )
    order = calculate_sale_revenue(
        Decimal("1500"),
        SaleMode.SELL_ORDER,
        DEFAULT_PREMIUM_SALES_TAX_RATE,
        DEFAULT_SETUP_FEE_RATE,
    )

    assert immediate.sales_tax == 60
    assert immediate.setup_fee == 0
    assert immediate.net_revenue == 1440
    assert order.sales_tax == 60
    assert order.setup_fee == 38  # ceil(1500 * 2.5%), independently from tax
    assert order.net_revenue == 1402


def test_non_premium_default_changes_tax_semantics() -> None:
    sale = calculate_sale_revenue(
        Decimal("101"),
        SaleMode.IMMEDIATE,
        DEFAULT_NON_PREMIUM_SALES_TAX_RATE,
        DEFAULT_SETUP_FEE_RATE,
    )

    assert sale.sales_tax == 9  # ceil(101 * 8%)
    assert sale.net_revenue == 92


def test_roi_is_null_when_total_cost_is_zero() -> None:
    result = calculate_financial_result(Decimal("0"), Decimal("100"), 5)

    assert result.profit == 100
    assert result.profit_per_unit == 20
    assert result.roi is None


def test_roi_is_profit_over_cost_not_margin_over_revenue() -> None:
    result = calculate_financial_result(Decimal("80"), Decimal("100"), 4)

    assert result.profit == 20
    assert result.profit_per_unit == 5
    assert result.roi == Decimal("0.25")


def test_display_truncates_to_one_decimal_without_changing_internal_value() -> None:
    internal_value = Decimal("2.525")

    assert round_down_for_display(internal_value) == Decimal("2.5")
    assert round_down_for_display(Decimal("-2.525")) == Decimal("-2.6")
    assert internal_value == Decimal("2.525")


@pytest.mark.parametrize("rate", [Decimal("-0.01"), Decimal("1.01")])
def test_rates_outside_fraction_range_are_rejected(rate: Decimal) -> None:
    with pytest.raises(ValueError):
        calculate_ingredient_requirement(1, 1, rate)


def test_float_is_rejected_to_avoid_binary_money_arithmetic() -> None:
    with pytest.raises(TypeError):
        calculate_sale_revenue(  # type: ignore[arg-type]
            100.0,
            SaleMode.IMMEDIATE,
            DEFAULT_PREMIUM_SALES_TAX_RATE,
            DEFAULT_SETUP_FEE_RATE,
        )
