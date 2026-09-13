"""Configurable defaults and stable identifiers for craft calculations."""

from decimal import Decimal
from enum import StrEnum

DEFAULT_PREMIUM_SALES_TAX_RATE = Decimal("0.04")
DEFAULT_NON_PREMIUM_SALES_TAX_RATE = Decimal("0.08")
DEFAULT_SETUP_FEE_RATE = Decimal("0.025")

# Nutrição consumida por execução = valor do item × este fator, e a estação cobra uma taxa por
# 100 de nutrição (task 4/18). Verificado contra a estação no jogo: Couro T4.2 (`@itemvalue` 64)
# a 390 por 100 de nutrição dá 28,08, e o jogo cobra 28.
NUTRITION_PER_ITEM_VALUE = Decimal("0.1125")
NUTRITION_FEE_BASIS = Decimal("100")
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
