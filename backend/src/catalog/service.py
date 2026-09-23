"""Catálogo estático de receitas (task 4/02, achado `X01`).

O ponto desta camada é **não olhar para preço nenhum**. O ranking materializado que ela
substitui derivava a lista de receitas do que já tinha sido observado no mercado
(`ranking_service.py:174-189`), então receita cuja saída nunca apareceu no livro não existia
para o produto. Aqui a fonte é a tabela `recipe`, e só ela.
"""

import hashlib
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.catalog.schemas import (
    CatalogIngredientOut,
    CatalogItemOut,
    CatalogRecipeOut,
    CatalogRecipesOut,
    CatalogUpgradeResourceOut,
)
from src.items.models import Item
from src.recipes.models import Recipe
from src.static_data.models import StaticDatasetVersion

PRODUCTION_KINDS = ("refining", "crafting")


async def catalog_version(session: AsyncSession) -> str:
    """Identidade do catálogo, para `ETag`.

    O catálogo só muda quando o dataset estático muda, então a versão ativa em
    `static_dataset_version` é a fonte certa. Sem dataset ativo (ambiente recém-migrado que
    ainda não semeou) devolve um marcador — nunca uma string vazia, que casaria com qualquer
    `If-None-Match`.
    """
    row = await session.scalar(
        select(StaticDatasetVersion.manifest_sha256)
        .where(StaticDatasetVersion.active.is_(True))
        .limit(1)
    )
    return row or "sem-dataset"


def shape_digest(modelos: list[tuple[str, list[str]]]) -> str:
    """Identidade do **formato** da resposta: nome do schema + campos, ordenados.

    Ordenado de propósito — reordenar um campo não muda o corpo de forma relevante, e fazer o
    digest depender disso invalidaria o cache de todo mundo a cada refactor cosmético.
    """
    assinatura = "|".join(f"{nome}:{','.join(sorted(campos))}" for nome, campos in sorted(modelos))
    return hashlib.sha256(assinatura.encode()).hexdigest()[:8]


def _shape_atual() -> str:
    return shape_digest(
        [
            (modelo.__name__, list(modelo.model_fields))
            for modelo in (
                CatalogRecipesOut,
                CatalogRecipeOut,
                CatalogItemOut,
                CatalogIngredientOut,
                CatalogUpgradeResourceOut,
            )
        ]
    )


def etag_for(version: str, kind: str | None, shape: str | None = None) -> str:
    """`kind` entra no ETag: `?kind=refining` e `?kind=crafting` são corpos diferentes da mesma
    versão de catálogo e não podem compartilhar validador.

    O **formato** também entra, e isso custou um incidente para aprender: quando
    `crafting_category` entrou no schema (task 4/17), o dataset estático não mudou — o dado do
    jogo era o mesmo — então o `ETag` não mudou, o navegador recebeu `304` e continuou servindo
    um corpo **sem o campo novo**. O cliente calculava o custo de foco como se ninguém tivesse
    especialização, sem erro em lugar nenhum.

    O digest é **derivado dos schemas**, não uma constante para alguém lembrar de incrementar:
    campo novo já muda o validador sozinho.
    """
    digest = hashlib.sha256(
        f"{shape or _shape_atual()}|{version}|{kind or 'all'}".encode()
    ).hexdigest()[:32]
    return f'"{digest}"'


async def get_recipe_catalog(session: AsyncSession, kind: str | None = None) -> CatalogRecipesOut:
    """Devolve o catálogo inteiro em **número constante de statements**: um SELECT das receitas
    com `selectinload` dos ingredientes (2 statements) e um SELECT dos itens referenciados."""
    stmt = select(Recipe).options(selectinload(Recipe.ingredients))
    if kind is not None:
        stmt = stmt.where(Recipe.production_kind == kind)
    stmt = stmt.order_by(Recipe.output_item_unique_name)

    recipes = (await session.scalars(stmt)).all()

    referenced: set[str] = set()
    recipe_rows: list[CatalogRecipeOut] = []
    for recipe in recipes:
        referenced.add(recipe.output_item_unique_name)

        ingredients = []
        for ingredient in recipe.ingredients:  # já ordenado por `position` na relationship
            referenced.add(ingredient.ingredient_unique_name)
            ingredients.append(
                CatalogIngredientOut(
                    item=ingredient.ingredient_unique_name,
                    count=ingredient.count,
                    enchantment_level=ingredient.enchantment_level,
                    return_eligible=ingredient.return_eligible,
                )
            )

        upgrade = None
        if recipe.upgrade_resource_unique_name and recipe.upgrade_resource_count:
            referenced.add(recipe.upgrade_resource_unique_name)
            upgrade = CatalogUpgradeResourceOut(
                item=recipe.upgrade_resource_unique_name,
                count=recipe.upgrade_resource_count,
            )

        recipe_rows.append(
            CatalogRecipeOut(
                output_item=recipe.output_item_unique_name,
                production_kind=recipe.production_kind,
                enchantment_level=recipe.enchantment_level,
                # F09 (task 3.6/10, P07): a coluna é `int` de propósito, mas o contrato não pode
                # expor isso -- dinheiro é decimal string ponta a ponta.
                silver_cost=Decimal(recipe.silver_cost),
                crafting_focus=recipe.crafting_focus,
                amount_crafted=recipe.amount_crafted,
                ingredients=ingredients,
                upgrade_resource=upgrade,
            )
        )

    items = (await session.scalars(select(Item).where(Item.unique_name.in_(referenced)))).all()

    return CatalogRecipesOut(
        version=await catalog_version(session),
        kind=kind,
        items=[CatalogItemOut.model_validate(item) for item in items],
        recipes=recipe_rows,
    )
