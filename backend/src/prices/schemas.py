from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel

from src.prices.constants import AlbionServer


class BookSide(BaseModel):
    """One side of the order book — ``sell`` (game ``offer``, the ask) or ``buy`` (game
    ``request``, the bid). Separate price universes: in real T2 cotton the sell side sat at
    37-39 and the buy side at 1-35 — they must never be collapsed into a single price."""

    best_price: Decimal | None = None
    observed_units: int = 0
    observed_orders: int = 0
    observed_at: datetime | None = None
    age_seconds: int | None = None


class SoldVolume(BaseModel):
    """Real turnover, from ``markethistories.ingest`` — the price actually transacted, not what
    someone is asking for in the book."""

    units: int
    average_price: Decimal | None = None


class LocationPrice(BaseModel):
    location_id: str
    quality_level: int
    enchantment_level: int
    sell: BookSide
    buy: BookSide
    sold_24h: SoldVolume | None = None
    coverage: Literal["parcial"]
    freshness_window_seconds: int


class ItemPricesOut(BaseModel):
    """Global partial observations, or the combinations covered by the user, per ``scope``.

    Under ``mine`` the book coverage and the history coverage are independent.
    """

    server: AlbionServer
    item_id: str
    scope: Literal["all", "mine"]
    prices: list[LocationPrice]
    total: int
    limit: int
    offset: int


class ItemSummary(BaseModel):
    unique_name: str
    name: str | None = None


class BookOut(BaseModel):
    sell: BookSide
    buy: BookSide
    coverage: Literal["parcial"]
    freshness_window_seconds: int


class SoldOut(BaseModel):
    last_24h: SoldVolume
    last_7d: SoldVolume
    last_30d: SoldVolume


class Series6hPoint(BaseModel):
    start: datetime
    units: int
    average_price: Decimal | None = None


class DemandOut(BaseModel):
    """Answers "how many people are buying this right now": ``book`` is demand parked in the
    request side of the order book, ``sold`` is real turnover over three windows, ``series_6h``
    is the raw series for plotting a trend. The view is global and does not inherit the
    ``scope`` of the prices endpoint."""

    server: AlbionServer
    item: ItemSummary
    location_id: str
    book: BookOut
    sold: SoldOut
    series_6h: list[Series6hPoint]
