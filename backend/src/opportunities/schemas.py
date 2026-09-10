from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field

from src.prices.constants import AlbionServer


class OpportunityOut(BaseModel):
    kind: Literal["flip"]
    item: str
    item_name: str | None = None
    quality_level: int | None = None
    buy_location: str | None = None
    sell_location: str | None = None
    buy_price: Decimal | None = None
    sell_price: Decimal | None = None
    quantity: int = 0
    # Resultado financeiro completo, mesma nomenclatura de craft/schemas.py em toda a API (B04):
    # gross_revenue é SEMPRE o faturamento bruto; gross_revenue - sales_tax - sale_setup_fee =
    # net_revenue; net_revenue - total_cost = profit. total_fees soma as três taxas para a UI não
    # precisar deduzi-las.
    gross_revenue: Decimal | None = None
    sales_tax: Decimal | None = None
    sale_setup_fee: Decimal | None = None
    net_revenue: Decimal | None = None
    acquisition_setup_fee: Decimal | None = None
    total_fees: Decimal | None = None
    total_cost: Decimal | None = None
    profit: Decimal | None = None
    roi: Decimal | None = None
    acquisition_mode: Literal["immediate", "buy_order"] | None = None
    sale_mode: Literal["immediate", "sell_order"] | None = None
    # O flip cota a melhor oferta/procura por cidade, com a quantidade limitada ao que esses
    # níveis têm; não caminha a profundidade. Era o único valor além de "neutral_ranking", que
    # saiu com o ranking materializado (task 4/15).
    price_model: Literal["top_of_book"] | None = None
    oldest_observed_at: str | None = None
    warnings: list[str] = Field(default_factory=list)


class OpportunityPage(BaseModel):
    server: AlbionServer
    kind: Literal["flip"]
    opportunities: list[OpportunityOut]
    total: int
    limit: int
    offset: int
