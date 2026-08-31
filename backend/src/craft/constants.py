"""Configurable defaults and stable identifiers for craft calculations."""

from decimal import Decimal
from enum import StrEnum

DEFAULT_PREMIUM_SALES_TAX_RATE = Decimal("0.04")
DEFAULT_NON_PREMIUM_SALES_TAX_RATE = Decimal("0.08")
DEFAULT_SETUP_FEE_RATE = Decimal("0.025")
DISPLAY_DECIMAL_PLACES = 1


class AcquisitionMode(StrEnum):
    """How ingredients are acquired."""

    IMMEDIATE = "immediate"
    BUY_ORDER = "buy_order"


class SaleMode(StrEnum):
    """How crafted output is sold."""

    IMMEDIATE = "immediate"
    SELL_ORDER = "sell_order"


class CraftWarning(StrEnum):
    """Stable warning identifiers returned by craft simulations."""

    STALE_DATA = "dado_velho"
    INSUFFICIENT_DEPTH = "profundidade_insuficiente"
    NO_PRICE = "sem_preco"
    NO_COVERAGE = "sem_cobertura"
    ORDER_NOT_GUARANTEED = "ordem_nao_garantida"
