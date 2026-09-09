"""Catálogo estático de receitas (task 4/02, achado `X01`).

O ponto desta camada é **não olhar para preço nenhum**. O ranking materializado que ela
substitui derivava a lista de receitas do que já tinha sido observado no mercado
(`ranking_service.py:174-189`), então receita cuja saída nunca apareceu no livro não existia
para o produto. Aqui a fonte é a tabela `recipe`, e só ela.
"""

import hashlib

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


def etag_for(version: str, kind: str | None) -> str:
    """`kind` entra no ETag: `?kind=refining` e `?kind=crafting` são corpos diferentes da mesma
    versão de catálogo e não podem compartilhar validador."""
    digest = hashlib.sha256(f"{version}|{kind or 'all'}".encode()).hexdigest()[:32]
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
                silver_cost=recipe.silver_cost,
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
