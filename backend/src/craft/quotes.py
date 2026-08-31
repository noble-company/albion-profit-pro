"""Shared order-book quoting primitives.

This is the public boundary between whoever composes a craft result (``craft.service`` for the
detail simulation, ``craft.compare_service`` for the city comparison) and the quoting logic
itself. Nothing here knows about recipes, taxes or scenarios — it turns a stack of executable
book levels into a priced quantity with stable warnings.
"""

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from src.craft.constants import CraftWarning
from src.prices.service import ExecutableBookLevel


@dataclass(frozen=True, slots=True)
class QuoteResult:
    payload: dict
    complete: bool
    warnings: tuple[CraftWarning, ...]


WARNING_ORDER = {
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


def ordered_warnings(*groups: tuple[CraftWarning, ...] | list[CraftWarning]) -> list[CraftWarning]:
    warnings = {warning for group in groups for warning in group}
    return sorted(warnings, key=WARNING_ORDER.__getitem__)


def quote_age_seconds(observed_at: datetime | None) -> int | None:
    if observed_at is None:
        return None
    return max(0, int((datetime.now(timezone.utc) - observed_at).total_seconds()))


def manual_side(manual_prices: Mapping[str, Any], item_id: str, side: str) -> Decimal | None:
    override = manual_prices.get(item_id)
    return getattr(override, side) if override is not None else None


def sorted_fresh_levels(
    levels: list[ExecutableBookLevel],
    auction_type: str,
) -> list[ExecutableBookLevel]:
    fresh = [level for level in levels if level.auction_type == auction_type and level.amount > 0]
    return sorted(
        fresh,
        key=lambda level: level.unit_price,
        reverse=auction_type == "request",
    )


def has_stale_side(levels: list[ExecutableBookLevel], auction_type: str) -> bool:
    return any(level.auction_type == auction_type and level.amount == 0 for level in levels)


def empty_quote(
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


def manual_quote(quantity: int, unit_price: Decimal, *, guaranteed: bool) -> QuoteResult:
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


def zero_quote(*, guaranteed: bool) -> QuoteResult:
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


def immediate_book_quote(
    quantity: int,
    auction_type: str,
    levels: list[ExecutableBookLevel],
    *,
    covered: bool,
) -> QuoteResult:
    if not covered:
        return empty_quote(quantity, CraftWarning.NO_COVERAGE, guaranteed=True)

    fresh_levels = sorted_fresh_levels(levels, auction_type)
    stale_side = has_stale_side(levels, auction_type)
    if not fresh_levels:
        warning = CraftWarning.STALE_DATA if stale_side else CraftWarning.NO_PRICE
        return empty_quote(quantity, warning, guaranteed=True)

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
    ordered = ordered_warnings(warnings)
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
            "age_seconds": quote_age_seconds(oldest_observed_at),
        },
        complete=complete,
        warnings=tuple(ordered),
    )


def order_quote(
    quantity: int,
    auction_type: str,
    levels: list[ExecutableBookLevel],
    *,
    covered: bool,
) -> QuoteResult:
    if not covered:
        return empty_quote(quantity, CraftWarning.NO_COVERAGE, guaranteed=False)

    fresh_levels = sorted_fresh_levels(levels, auction_type)
    if not fresh_levels:
        warning = (
            CraftWarning.STALE_DATA
            if has_stale_side(levels, auction_type)
            else CraftWarning.NO_PRICE
        )
        return empty_quote(quantity, warning, guaranteed=False)

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
            "age_seconds": quote_age_seconds(best.latest_seen_at),
        },
        complete=True,
        warnings=(),
    )


def quote(
    quantity: int,
    auction_type: str,
    levels: list[ExecutableBookLevel],
    manual_price: Decimal | None,
    *,
    covered: bool,
    order: bool,
) -> QuoteResult:
    if quantity == 0:
        return zero_quote(guaranteed=True)
    if manual_price is not None:
        return manual_quote(quantity, manual_price, guaranteed=False)
    if order:
        return order_quote(quantity, auction_type, levels, covered=covered)
    return immediate_book_quote(quantity, auction_type, levels, covered=covered)
