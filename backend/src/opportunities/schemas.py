from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field

from src.prices.constants import AlbionServer


class OpportunityIngredientOut(BaseModel):
    item: str
    item_name: str | None = None
    gross_quantity: int
    expected_return_quantity: Decimal
    purchase_quantity: int


class OpportunityOut(BaseModel):
    kind: Literal["flip", "refining", "crafting"]
    item: str
    item_name: str | None = None
    quality_level: int | None = None
    buy_location: str | None = None
    sell_location: str | None = None
    buy_price: Decimal | None = None
    sell_price: Decimal | None = None
    quantity: int = 0
    total_cost: Decimal | None = None
    gross_revenue: Decimal | None = None
    profit: Decimal | None = None
    roi: Decimal | None = None
    acquisition_mode: Literal["immediate", "buy_order"] | None = None
    sale_mode: Literal["immediate", "sell_order"] | None = None
    ingredients: list[OpportunityIngredientOut] = Field(default_factory=list)
    station_cost: Decimal | None = None
    focus_consumed: int | None = None
    oldest_observed_at: str | None = None
    warnings: list[str] = Field(default_factory=list)


class OpportunityPage(BaseModel):
    server: AlbionServer
    kind: Literal["flip", "refining", "crafting"]
    opportunities: list[OpportunityOut]
    total: int
    limit: int
    offset: int
