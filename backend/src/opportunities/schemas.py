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


class RankingComponentsOut(BaseModel):
    """Componentes neutros de uma linha do ranking materializado (task 3.5/23).

    Premium, imposto, taxa de retorno, custo de estação e foco são transformações baratas
    sobre estes números — o cliente as aplica na hora (`src/lib/ranking-projection.ts`), sem
    round-trip. O que o servidor faz é a varredura (avaliar milhares de receitas contra o
    livro); o que ele não precisa fazer é multiplicar por 0,96 a cada tecla.
    """

    recipe_silver_cost: int
    crafting_focus: int
    executions: int
    produced_quantity: int
    # None quando não há oferta/procura o suficiente naquele lado.
    ingredient_cost_immediate: Decimal | None = None
    ingredient_cost_order: Decimal | None = None
    output_gross_immediate: Decimal | None = None
    output_gross_order: Decimal | None = None
    ingredients_oldest_observed_at: str | None = None
    output_immediate_observed_at: str | None = None
    output_order_observed_at: str | None = None


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
    # - "top_of_book": flip cota a melhor oferta/procura por cidade, quantidade limitada ao que
    #   esses níveis têm; não caminha a profundidade.
    # - "neutral_ranking": refino/craft vêm do ranking materializado em parâmetros neutros;
    #   premium, retorno, estação e imposto são projeção sobre a página. O detalhe exato é
    #   POST /craft/simulate.
    price_model: Literal["top_of_book", "neutral_ranking"] | None = None
    ingredients: list[OpportunityIngredientOut] = Field(default_factory=list)
    station_cost: Decimal | None = None
    focus_consumed: int | None = None
    oldest_observed_at: str | None = None
    warnings: list[str] = Field(default_factory=list)
    # Só nas linhas de ranking (refino/craft). O flip não tem "e se" no cliente. Os campos
    # financeiros acima trazem a projeção default do servidor (premium on, retorno 0); a UI
    # os recalcula a partir daqui quando o usuário mexe nos controles.
    components: RankingComponentsOut | None = None


class RankingCoverage(BaseModel):
    """Cobertura da última reconstrução do ranking materializado, para a UI nunca esconder
    truncamento (``B02``)."""

    evaluated_recipes: int
    priced_recipes: int
    total_recipes: int
    computed_at: str | None = None
    stale: bool


class OpportunityPage(BaseModel):
    server: AlbionServer
    kind: Literal["flip", "refining", "crafting"]
    opportunities: list[OpportunityOut]
    total: int
    limit: int
    offset: int
    # Presente só nas telas de produção (refino/craft), que leem o ranking materializado.
    coverage: RankingCoverage | None = None
