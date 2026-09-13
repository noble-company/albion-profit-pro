from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field

from src.craft.constants import AcquisitionMode, CraftWarning, SaleMode
from src.prices.constants import AlbionServer


class ManualPriceOverride(BaseModel):
    """Manual prices by market-book side.

    ``offer`` replaces an ask (immediate acquisition / sell-order target); ``request`` replaces
    a bid (buy-order target / immediate sale).
    """

    offer: Decimal | None = Field(default=None, gt=0)
    request: Decimal | None = Field(default=None, gt=0)


class IngredientOverride(BaseModel):
    quality_level: int = Field(default=1, ge=1, le=5)
    # `None` = o que a receita diz (task 4/26). O padrão era `True`: mandar só a qualidade de um
    # ingrediente reescrevia a marca do dump e dava desconto de retorno ao artefato.
    return_eligible: bool | None = None


class CraftRequestBase(BaseModel):
    server: AlbionServer
    output_item: str = Field(min_length=1, max_length=64)
    quantity: int = Field(ge=1)
    output_quality: int = Field(default=1, ge=1, le=5)
    scope: Literal["all", "mine"] = "all"
    return_rate: Decimal = Field(default=Decimal("0"), ge=0, le=1)
    # Taxa de uso da estação **por 100 de nutrição consumida** — como o jogo cobra. Prata fixa
    # por execução não existe: a nutrição sai do valor do item, e um recurso T4 e uma arma T8
    # diferem por três ordens de grandeza (task 4/18).
    station_fee_per_100_nutrition: Decimal = Field(default=Decimal("0"), ge=0)
    use_focus: bool = False
    premium: bool = True
    sales_tax_rate: Decimal | None = Field(default=None, ge=0, le=1)
    setup_fee_rate: Decimal | None = Field(default=None, ge=0, le=1)
    ingredient_overrides: dict[str, IngredientOverride] = Field(default_factory=dict)
    manual_prices: dict[str, ManualPriceOverride] = Field(default_factory=dict)


class CraftSimulationRequest(CraftRequestBase):
    location_id: str = Field(min_length=1, max_length=64)


class CraftCompareRequest(CraftRequestBase):
    acquisition_mode: AcquisitionMode = AcquisitionMode.IMMEDIATE
    sale_mode: SaleMode = SaleMode.IMMEDIATE


class QuoteLevelOut(BaseModel):
    unit_price: Decimal
    quantity: int
    subtotal: Decimal
    observed_at: datetime | None = None


class MarketQuoteOut(BaseModel):
    requested_quantity: int
    priced_quantity: int
    unit_price: Decimal | None
    total: Decimal | None
    complete: bool
    guaranteed: bool
    source: Literal["book", "manual", "book_suggestion"] | None
    levels: list[QuoteLevelOut]
    warnings: list[CraftWarning]
    oldest_observed_at: datetime | None = None
    age_seconds: int | None = None


class IngredientSimulationOut(BaseModel):
    position: int
    unique_name: str
    quality_level: int
    count_per_execution: int
    return_eligible: bool
    gross_quantity: int
    expected_return_quantity: Decimal
    effective_quantity: Decimal
    purchase_quantity: int
    immediate_purchase: MarketQuoteOut
    buy_order: MarketQuoteOut


class RecipeSimulationOut(BaseModel):
    silver_cost_per_execution: int
    crafting_focus_per_execution: int
    amount_crafted: int


class OutputSaleQuotesOut(BaseModel):
    immediate_sale: MarketQuoteOut
    sell_order: MarketQuoteOut


class CostBreakdownOut(BaseModel):
    ingredient_cost: Decimal | None
    recipe_silver_cost: Decimal
    station_cost: Decimal
    upgrade_cost: Decimal
    acquisition_setup_fee: Decimal | None
    total_cost: Decimal | None


class RevenueBreakdownOut(BaseModel):
    gross_revenue: Decimal | None
    sales_tax: Decimal | None
    sale_setup_fee: Decimal | None
    net_revenue: Decimal | None


class CraftScenarioOut(BaseModel):
    acquisition_mode: AcquisitionMode
    sale_mode: SaleMode
    costs: CostBreakdownOut
    revenue: RevenueBreakdownOut
    profit: Decimal | None
    profit_per_unit: Decimal | None
    roi: Decimal | None
    warnings: list[CraftWarning]


class CraftSimulationOut(BaseModel):
    server: AlbionServer
    output_item: str
    location_id: str
    output_quality: int
    scope: Literal["all", "mine"]
    requested_quantity: int
    executions: int
    produced_quantity: int
    surplus_quantity: int
    return_rate: Decimal
    focus_consumed: int
    premium: bool
    sales_tax_rate: Decimal
    setup_fee_rate: Decimal
    recipe: RecipeSimulationOut
    ingredients: list[IngredientSimulationOut]
    output_quotes: OutputSaleQuotesOut
    scenarios: list[CraftScenarioOut]


class AcquisitionQuoteOut(BaseModel):
    item_id: str
    quality_level: int
    enchantment_level: int
    quantity: int
    category: Literal["ready_item", "ingredient", "upgrade_resource"]
    quote: MarketQuoteOut


class UpgradeStepOut(BaseModel):
    from_level: int
    to_level: int
    resource_item: str
    resource_count_per_item: int
    quantity: int


class CompareRouteCostOut(BaseModel):
    ready_item_cost: Decimal | None
    ingredient_cost: Decimal | None
    upgrade_resource_cost: Decimal | None
    recipe_silver_cost: Decimal
    station_cost: Decimal
    acquisition_setup_fee: Decimal | None
    total_cost: Decimal | None


class CompareRouteOut(BaseModel):
    route: Literal["buy_ready", "craft_direct", "base_upgrade"]
    available: bool
    unavailable_reason: str | None
    executions: int
    produced_quantity: int
    surplus_quantity: int
    focus_consumed: int
    costs: CompareRouteCostOut
    acquisition_quotes: list[AcquisitionQuoteOut]
    upgrade_steps: list[UpgradeStepOut]
    sale_quote: MarketQuoteOut
    net_revenue: Decimal | None
    profit: Decimal | None
    profit_per_unit: Decimal | None
    roi: Decimal | None
    warnings: list[CraftWarning]


class CityComparisonOut(BaseModel):
    location_id: str
    location_name: str
    routes: list[CompareRouteOut]
    best_route: Literal["buy_ready", "craft_direct", "base_upgrade"] | None
    profit: Decimal | None
    roi: Decimal | None


class CraftCompareOut(BaseModel):
    server: AlbionServer
    output_item: str
    output_quality: int
    scope: Literal["all", "mine"]
    requested_quantity: int
    acquisition_mode: AcquisitionMode
    sale_mode: SaleMode
    same_city_only: Literal[True]
    transport_included: Literal[False]
    sales_tax_rate: Decimal
    setup_fee_rate: Decimal
    ranked_cities: list[CityComparisonOut]
    unavailable_cities: list[CityComparisonOut]
