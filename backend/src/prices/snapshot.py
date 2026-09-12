"""Topo de livro em massa — escrita e leitura de `price_snapshot` (task 4/03).

Duas fontes escrevem aqui: o nosso ingest (`source='client'`, derivado de `market_order`) e o
poller da API pública (`source='aodp'`, task 4/04). A regra que as concilia é uma só e vive no
`_UPSERT_SET` abaixo: **por lado, o `observed_at` mais recente vence**.

O que esta camada deliberadamente NÃO faz: filtrar por frescor. O snapshot guarda a última
observação que existe, com a idade dela; esconder linha velha é decisão de tela, não de
armazenamento. Foi exatamente o contrário disso (`X02`) que fazia receita sumir do produto.
"""

from sqlalchemy import and_, case, func, or_, select, tuple_, union
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from src.items.models import Item
from src.prices.models import MarketOrder, PriceSnapshot
from src.prices.service import latest_order_observation_filter
from src.recipes.models import Recipe, RecipeIngredient

SOURCE_CLIENT = "client"
SOURCE_AODP = "aodp"

# A categoria de quem não tem categoria no dump — a mesma de `frontend/src/scanner/categorias.ts`.
OUTROS = "other"

# A aba de Comida & Poções (task 4/13): tudo de `consumables`, mais os insumos da cozinha. O código
# do insumo é da aba, não do dump — `fish` já é "Pesca" na Coleta. Espelho de `INSUMOS` em
# `frontend/src/scanner/categorias.ts`.
CONSUMIVEIS = "consumables"
CATEGORIA_DOS_INSUMOS = "insumos"
INSUMOS = {
    "fishsauce": ("crafting", "fish"),
    "farmingproducts": ("farming", "farmingproducts"),
}

Combo = tuple[str, str, int, int]  # item_id, location_id, quality_level, enchantment_level


async def upsert_snapshot(session: AsyncSession, server_id: str, rows: list[dict]) -> int:
    """Grava/atualiza combos no snapshot. Devolve quantas linhas foram enviadas.

    Cada `row` traz a identidade do combo e um ou ambos os lados. Um lado ausente chega como
    `None` e **não apaga** o que já estava lá.
    """
    if not rows:
        return 0

    values = [{"server_id": server_id, **row} for row in rows]
    stmt = pg_insert(PriceSnapshot).values(values)
    excluded = stmt.excluded

    def _side(price_col: str, at_col: str, source_col: str) -> dict:
        """Um lado só é substituído quando a observação que chega é **estritamente mais nova**.

        Sem isso, o poller da API pública (mediana de 7 h de idade, medida na task 4/04)
        apagaria o preço de minutos atrás que o nosso client acabou de trazer — o produto
        ficaria pior exatamente onde tem o melhor dado.
        """
        newer = and_(
            getattr(excluded, at_col).isnot(None),
            or_(
                getattr(PriceSnapshot, at_col).is_(None),
                getattr(excluded, at_col) > getattr(PriceSnapshot, at_col),
            ),
        )
        return {
            col: case((newer, getattr(excluded, col)), else_=getattr(PriceSnapshot, col))
            for col in (price_col, at_col, source_col)
        }

    stmt = stmt.on_conflict_do_update(
        constraint="uq_price_snapshot_combo",
        set_={
            **_side("sell_min", "sell_observed_at", "sell_source"),
            **_side("buy_max", "buy_observed_at", "buy_source"),
            "updated_at": func.now(),
        },
    )
    await session.execute(stmt)
    return len(values)


async def refresh_snapshot_from_orders(
    session: AsyncSession, server_id: str, combos: set[Combo]
) -> int:
    """Recalcula o topo de livro dos combos a partir de `market_order` e grava com
    `source='client'`.

    Usa `latest_order_observation_filter` para não misturar a varredura nova com uma ordem que
    já saiu do livro, e descarta ordem expirada (`B03`). **Não** aplica janela de frescor.
    """
    if not combos:
        return 0

    identity = (
        MarketOrder.item_id,
        MarketOrder.location_id,
        MarketOrder.quality_level,
        MarketOrder.enchantment_level,
    )
    stmt = (
        select(
            *identity,
            func.min(MarketOrder.unit_price_silver)
            .filter(MarketOrder.auction_type == "offer")
            .label("sell_min"),
            func.max(MarketOrder.last_seen_at)
            .filter(MarketOrder.auction_type == "offer")
            .label("sell_observed_at"),
            func.max(MarketOrder.unit_price_silver)
            .filter(MarketOrder.auction_type == "request")
            .label("buy_max"),
            func.max(MarketOrder.last_seen_at)
            .filter(MarketOrder.auction_type == "request")
            .label("buy_observed_at"),
        )
        .where(
            MarketOrder.server_id == server_id,
            MarketOrder.expires > func.now(),
            tuple_(*identity).in_(combos),
            latest_order_observation_filter(),
        )
        .group_by(*identity)
    )

    rows = []
    for row in (await session.execute(stmt)).all():
        rows.append(
            {
                "item_id": row.item_id,
                "location_id": row.location_id,
                "quality_level": row.quality_level,
                "enchantment_level": row.enchantment_level,
                "sell_min": row.sell_min,
                "sell_observed_at": row.sell_observed_at,
                "sell_source": SOURCE_CLIENT if row.sell_min is not None else None,
                "buy_max": row.buy_max,
                "buy_observed_at": row.buy_observed_at,
                "buy_source": SOURCE_CLIENT if row.buy_max is not None else None,
            }
        )

    return await upsert_snapshot(session, server_id, rows)


def itens_da_categoria(kind: str, category: str, subcategory: str | None = None):
    """Os itens que as receitas de uma categoria precisam cotar: saídas, ingredientes e recurso
    de upgrade (task 4/22).

    **Espelho de `lugarDaReceita`** (`frontend/src/scanner/categorias.ts`). No refino a categoria
    é a família (`shop_subcategory2`); no craft, `shop_category` e `shop_subcategory`. Item sem
    categoria no dump — ou saída sem linha em `item` — mora em Outros. Se as duas regras
    divergirem, a tela escolhe uma categoria e recebe o preço de outra.

    A regra que esconde o que não se vende (`UNIQUE_`, `QUESTITEM_`…) fica só na tela: aqui ela
    custaria uma segunda cópia, e o pior caso de não aplicá-la é mandar algumas linhas a mais.
    """
    # Alias de propósito: as três consultas de fora também leem `recipe`, e um `IN (subquery)`
    # sobre a mesma tabela seria correlacionado sozinho — o filtro viraria "a própria linha".
    receita = aliased(Recipe)
    receitas = _na_categoria(
        select(receita.id).outerjoin(Item, Item.unique_name == receita.output_item_unique_name),
        receita,
        kind,
        category,
        subcategory,
    )

    return union(
        select(Recipe.output_item_unique_name).where(Recipe.id.in_(receitas)),
        select(RecipeIngredient.ingredient_unique_name).where(
            RecipeIngredient.recipe_id.in_(receitas)
        ),
        select(Recipe.upgrade_resource_unique_name).where(
            Recipe.id.in_(receitas), Recipe.upgrade_resource_unique_name.is_not(None)
        ),
    )


def _na_categoria(stmt, receita, kind: str, category: str, subcategory: str | None):
    """A regra da categoria de uma receita, sobre uma consulta que já junta `receita` e `Item`
    pela saída. Uma cópia só, para o snapshot (task 22) e as vendas (task 23) não divergirem."""
    if kind == CONSUMIVEIS:
        # A aba lê o catálogo de craft; a categoria é Comida/Poções e a subcategoria, a família.
        stmt = stmt.where(receita.production_kind == "crafting")
        if category == CATEGORIA_DOS_INSUMOS:
            pares = (
                [INSUMOS[subcategory]]
                if subcategory in INSUMOS
                else ([] if subcategory else list(INSUMOS.values()))
            )
            return stmt.where(tuple_(Item.shop_category, Item.shop_subcategory).in_(pares))
        stmt = stmt.where(
            Item.shop_category == CONSUMIVEIS,
            func.coalesce(Item.shop_subcategory, OUTROS) == category,
        )
        if subcategory:
            stmt = stmt.where(func.coalesce(Item.shop_subcategory2, OUTROS) == subcategory)
        return stmt

    stmt = stmt.where(receita.production_kind == kind)
    if kind == "refining":
        return stmt.where(func.coalesce(Item.shop_subcategory2, OUTROS) == category)
    stmt = stmt.where(func.coalesce(Item.shop_category, OUTROS) == category)
    if subcategory:
        stmt = stmt.where(func.coalesce(Item.shop_subcategory, OUTROS) == subcategory)
    return stmt


def saidas_da_categoria(kind: str, category: str, subcategory: str | None = None):
    """Só as saídas das receitas da categoria — o que se **vende** (task 4/23). O volume de venda
    da barra que entra na espada não é assunto da tela de espadas."""
    receita = aliased(Recipe)
    return _na_categoria(
        select(receita.output_item_unique_name).outerjoin(
            Item, Item.unique_name == receita.output_item_unique_name
        ),
        receita,
        kind,
        category,
        subcategory,
    )


async def read_snapshot(
    session: AsyncSession,
    server_id: str,
    location_ids: list[str] | None = None,
    *,
    kind: str | None = None,
    category: str | None = None,
    subcategory: str | None = None,
) -> list[PriceSnapshot]:
    """Lê o snapshot do realm. **Sem filtro de frescor** — a idade viaja em `observed_at` e
    quem decide o que esconder é a tela.

    Com `kind` + `category`, só os itens das receitas daquela categoria (task 4/22): o realm West
    são 20.364 linhas e 187 KB com gzip a cada 30 s; uma subcategoria, de 4 a 15 KB."""
    stmt = select(PriceSnapshot).where(PriceSnapshot.server_id == server_id)
    if location_ids:
        stmt = stmt.where(PriceSnapshot.location_id.in_(location_ids))
    if kind is not None and category is not None:
        stmt = stmt.where(
            PriceSnapshot.item_id.in_(itens_da_categoria(kind, category, subcategory))
        )
    stmt = stmt.order_by(PriceSnapshot.location_id, PriceSnapshot.item_id)
    return list((await session.scalars(stmt)).all())


def _epoch(value) -> int | None:
    return None if value is None else int(value.timestamp())


def _price(value) -> str | None:
    # F09: dinheiro é string decimal; `normalize()` tira os zeros à direita do Numeric(18,4).
    return None if value is None else format(value.normalize(), "f")


def to_columnar(rows: list[PriceSnapshot]) -> dict:
    """Converte as linhas para arrays paralelos com dicionários de string.

    Motivação medida (task 4/03): array de objetos custou 23 B/linha gzipped — ~67 KB por
    cidade e ~560 KB nas oito, num payload que o cliente busca a cada 30 s. Aqui as chaves
    aparecem uma vez, `item_id`/`location_id`/`source` viram índices e os timestamps viram
    epoch em segundos.
    """
    items: dict[str, int] = {}
    locations: dict[str, int] = {}
    sources: dict[str, int] = {}

    def _index(registry: dict[str, int], value: str | None) -> int | None:
        if value is None:
            return None
        if value not in registry:
            registry[value] = len(registry)
        return registry[value]

    columns: dict[str, list] = {
        name: []
        for name in (
            "item",
            "location",
            "quality",
            "enchantment",
            "sell_min",
            "sell_observed_at",
            "sell_source",
            "buy_max",
            "buy_observed_at",
            "buy_source",
        )
    }

    for row in rows:
        columns["item"].append(_index(items, row.item_id))
        columns["location"].append(_index(locations, row.location_id))
        columns["quality"].append(row.quality_level)
        columns["enchantment"].append(row.enchantment_level)
        columns["sell_min"].append(_price(row.sell_min))
        columns["sell_observed_at"].append(_epoch(row.sell_observed_at))
        columns["sell_source"].append(_index(sources, row.sell_source))
        columns["buy_max"].append(_price(row.buy_max))
        columns["buy_observed_at"].append(_epoch(row.buy_observed_at))
        columns["buy_source"].append(_index(sources, row.buy_source))

    return {
        "row_count": len(rows),
        "items": list(items),
        "locations": list(locations),
        "sources": list(sources),
        "columns": columns,
    }
