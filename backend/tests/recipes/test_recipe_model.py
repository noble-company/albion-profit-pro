import uuid

from sqlalchemy import select

from src.database import async_session_maker
from src.recipes.models import Recipe, RecipeIngredient


def _unique_name() -> str:
    return f"TEST_ITEM_{uuid.uuid4().hex[:8]}"


async def test_recipe_with_ingredients_relationship():
    """Replica o exemplo real do T3_CLOTH (docs/02-dados-de-receita.md): 2 ingredientes."""
    output_name = _unique_name()

    async with async_session_maker() as session:
        recipe = Recipe(
            output_item_unique_name=output_name,
            output_item_id=None,  # simula item sem correspondência em items.json
            silver_cost=0,
            crafting_focus=31,
            amount_crafted=1,
            craft_time=0.03125,
        )
        recipe.ingredients.append(
            RecipeIngredient(ingredient_unique_name="T3_FIBER", count=2, enchantment_level=0)
        )
        recipe.ingredients.append(
            RecipeIngredient(ingredient_unique_name="T2_CLOTH", count=1, enchantment_level=0)
        )
        session.add(recipe)
        await session.commit()
        recipe_id = recipe.id

        # relacionamento carrega certo
        result = await session.execute(select(Recipe).where(Recipe.id == recipe_id))
        loaded = result.scalar_one()
        await session.refresh(loaded, attribute_names=["ingredients"])
        assert len(loaded.ingredients) == 2
        ingredient_names = {i.ingredient_unique_name for i in loaded.ingredients}
        assert ingredient_names == {"T3_FIBER", "T2_CLOTH"}

        # session.delete(obj) (ORM), não um DELETE em massa via Core — só o
        # primeiro aciona o cascade="all, delete-orphan" pros ingredientes.
        await session.delete(loaded)
        await session.commit()


async def test_delete_recipe_cascades_to_ingredients():
    output_name = _unique_name()

    async with async_session_maker() as session:
        recipe = Recipe(output_item_unique_name=output_name)
        recipe.ingredients.append(
            RecipeIngredient(ingredient_unique_name="T2_FIBER", count=1, enchantment_level=0)
        )
        session.add(recipe)
        await session.commit()
        recipe_id = recipe.id

        await session.delete(recipe)
        await session.commit()

        # cascade="all, delete-orphan" deve ter apagado o ingrediente junto
        result = await session.execute(
            select(RecipeIngredient).where(RecipeIngredient.recipe_id == recipe_id)
        )
        assert result.scalars().all() == []
