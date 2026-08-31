"""Unit tests for the extracted quoting boundary (``src.craft.quotes``).

These have no database: they turn ``ExecutableBookLevel`` stacks into priced quantities.
"""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

from src.craft.constants import CraftWarning
from src.craft.quotes import (
    manual_side,
    ordered_warnings,
    quote,
)
from src.prices.service import ExecutableBookLevel

NOW = datetime.now(timezone.utc)


def _level(auction_type: str, price: str, amount: int, *, age_minutes: int = 1):
    return ExecutableBookLevel(
        item_id="T4_ITEM",
        location_id="1002",
        quality_level=1,
        enchantment_level=0,
        auction_type=auction_type,
        unit_price=Decimal(price),
        amount=amount,
        latest_seen_at=NOW - timedelta(minutes=age_minutes),
    )


def test_zero_quantity_is_a_complete_zero_quote():
    result = quote(0, "offer", [], None, covered=True, order=False)
    assert result.complete is True
    assert result.warnings == ()
    assert result.payload["total"] == Decimal("0")


def test_manual_price_wins_over_the_book():
    result = quote(
        3, "offer", [_level("offer", "100", 10)], Decimal("50"), covered=True, order=False
    )
    assert result.payload["source"] == "manual"
    assert result.payload["total"] == Decimal("150")
    assert result.payload["guaranteed"] is False


def test_uncovered_combo_returns_no_coverage():
    result = quote(5, "offer", [], None, covered=False, order=False)
    assert result.complete is False
    assert result.warnings == (CraftWarning.NO_COVERAGE,)


def test_covered_but_empty_book_returns_no_price():
    result = quote(5, "offer", [], None, covered=True, order=False)
    assert result.warnings == (CraftWarning.NO_PRICE,)


def test_only_stale_levels_returns_stale_data():
    result = quote(5, "offer", [_level("offer", "100", 0)], None, covered=True, order=False)
    assert result.warnings == (CraftWarning.STALE_DATA,)


def test_immediate_walk_consumes_cheapest_levels_first():
    levels = [_level("offer", "120", 4), _level("offer", "100", 3)]
    result = quote(5, "offer", levels, None, covered=True, order=False)
    assert result.complete is True
    # 3 @ 100 + 2 @ 120 = 540
    assert result.payload["total"] == Decimal("540")
    assert result.payload["priced_quantity"] == 5
    assert result.payload["levels"][0]["unit_price"] == Decimal("100")


def test_immediate_walk_flags_insufficient_depth():
    result = quote(10, "offer", [_level("offer", "100", 3)], None, covered=True, order=False)
    assert result.complete is False
    assert CraftWarning.INSUFFICIENT_DEPTH in result.warnings
    assert result.payload["priced_quantity"] == 3


def test_order_quote_takes_the_best_level_and_is_not_guaranteed():
    levels = [_level("request", "200", 1), _level("request", "260", 1)]
    result = quote(9, "request", levels, None, covered=True, order=True)
    assert result.complete is True
    assert result.payload["guaranteed"] is False
    assert result.payload["source"] == "book_suggestion"
    # best request price is the highest, applied to the full quantity
    assert result.payload["total"] == Decimal("2340")


def test_ordered_warnings_follow_the_canonical_order():
    ordered = ordered_warnings(
        [CraftWarning.ORDER_NOT_GUARANTEED, CraftWarning.NO_COVERAGE],
        [CraftWarning.STALE_DATA],
    )
    assert ordered == [
        CraftWarning.NO_COVERAGE,
        CraftWarning.STALE_DATA,
        CraftWarning.ORDER_NOT_GUARANTEED,
    ]


def test_manual_side_reads_the_override_mapping():
    class _Override:
        offer = Decimal("11")
        request = Decimal("22")

    prices = {"T4_ITEM": _Override()}
    assert manual_side(prices, "T4_ITEM", "offer") == Decimal("11")
    assert manual_side(prices, "T4_ITEM", "request") == Decimal("22")
    assert manual_side(prices, "MISSING", "offer") is None
