"""Contrato do catálogo estático (task 4/02).

Inglês em toda a superfície HTTP (`B09`). Dinheiro e grandezas derivadas viajam como string
decimal (`F09`) — aqui isso vale para `weight`, que entra na divisão `lucro / peso` do scanner,
para `item_value`, que multiplica a taxa da estação, e para `silver_cost` (task 3.6/10, `P07`),
que soma direto no custo total de uma receita.

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
    # Base da taxa da estação: o jogo cobra por nutrição consumida, e
    # `nutrição = item_value × 0,1125` (task 4/18). Nulo só para item sem valor publicado e sem
    # receita — ingrediente sem valor conta zero (task 4/13).
    item_value: Decimal | None = None
    shop_category: str | None = None
    shop_subcategory: str | None = None
    # Terceiro nível do mercado do jogo. É ele que separa as famílias do refino: todo produto
    # refinado é `crafting/refinedresources` nos dois primeiros níveis (task 4/21).
    shop_subcategory2: str | None = None
    # Ramo do Painel do Destino — o cliente usa para achar o nó que reduz o foco (task 4/17).
    crafting_category: str | None = None

    @field_serializer("weight", "item_value")
    def _decimal_as_string(self, value: Decimal | None) -> str | None:
        # F09: grandeza que entra em conta exibida nunca vira float no fio. `item_value`
        # multiplica a taxa da estação, que o usuário lê como prata cobrada.
        return None if value is None else format(value.normalize(), "f")


class CatalogIngredientOut(BaseModel):
    """Um ingrediente da receita. A ordem no array **é** a `position` original do dump."""

    item: str
    count: int
    enchantment_level: int = 0
    # Falso para o que o jogo não devolve no retorno de recurso — artefato, cristal, token. O
    # cliente compra esse ingrediente para todas as execuções da sessão (task 4/26).
    return_eligible: bool = True


class CatalogUpgradeResourceOut(BaseModel):
    """Rota alternativa: encantar um item já craftado, em vez de craftá-lo já encantado."""

    item: str
    count: int


class CatalogRecipeOut(BaseModel):
    output_item: str
    production_kind: str  # "refining" | "crafting"
    enchantment_level: int
    silver_cost: Decimal
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
