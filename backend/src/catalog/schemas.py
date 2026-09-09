"""Contrato do catálogo estático (task 4/02).

Inglês em toda a superfície HTTP (`B09`). Dinheiro e grandezas derivadas viajam como string
decimal (`F09`) — aqui isso vale para `weight`, que entra na divisão `lucro / peso` do scanner.

Formato deliberado: **dicionário de itens + receitas que o referenciam**. Um mesmo ingrediente
aparece em centenas de receitas; repetir nome/tier/peso em cada uma multiplicaria o payload sem
acrescentar informação.
"""

from decimal import Decimal

from pydantic import BaseModel, ConfigDict, field_serializer


class CatalogItemOut(BaseModel):
    """Um item referenciado pelo catálogo — como saída, ingrediente ou recurso de upgrade."""

    model_config = ConfigDict(from_attributes=True)

    unique_name: str
    name_en: str | None = None
    name_pt: str | None = None
    tier: int | None = None
    enchantment_level: int = 0
    weight: Decimal | None = None
    shop_category: str | None = None
    shop_subcategory: str | None = None

    @field_serializer("weight")
    def _weight_as_string(self, value: Decimal | None) -> str | None:
        # F09: grandeza que entra em divisão exibida nunca vira float no fio.
        return None if value is None else format(value.normalize(), "f")


class CatalogIngredientOut(BaseModel):
    """Um ingrediente da receita. A ordem no array **é** a `position` original do dump."""

    item: str
    count: int
    enchantment_level: int = 0


class CatalogUpgradeResourceOut(BaseModel):
    """Rota alternativa: encantar um item já craftado, em vez de craftá-lo já encantado."""

    item: str
    count: int


class CatalogRecipeOut(BaseModel):
    output_item: str
    production_kind: str  # "refining" | "crafting"
    enchantment_level: int
    silver_cost: int
    crafting_focus: int
    amount_crafted: int
    ingredients: list[CatalogIngredientOut]
    upgrade_resource: CatalogUpgradeResourceOut | None = None


class CatalogRecipesOut(BaseModel):
    """O catálogo inteiro. **Sem paginação e sem preço** — paginar aqui reintroduziria o
    problema que a Fase 4 existe para resolver (`X01`): a lista de receitas do produto deixaria
    de ser o catálogo e voltaria a ser um recorte."""

    version: str
    kind: str | None = None
    items: list[CatalogItemOut]
    recipes: list[CatalogRecipeOut]
