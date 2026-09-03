from sqlalchemy import exists, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased, selectinload

from src.items.models import Item
from src.recipes.models import Recipe, RecipeIngredient


class ItemNotFoundError(LookupError):
    pass


class RecipeUnavailableError(LookupError):
    pass


def _base_unique_name(unique_name: str) -> str:
    base, separator, suffix = unique_name.rpartition("@")
    if not separator or not suffix.isdigit():
        return unique_name
    resource_suffix = f"_LEVEL{suffix}"
    return base.removesuffix(resource_suffix) if base.endswith(resource_suffix) else base


def enchanted_unique_name(base_name: str, level: int, *, resource_style: bool) -> str:
    if level == 0:
        return base_name
    return f"{base_name}_LEVEL{level}@{level}" if resource_style else f"{base_name}@{level}"


async def get_recipe_family(session: AsyncSession, unique_name: str) -> dict[int, Recipe]:
    """Load the exact base-to-target recipe chain in a fixed number of queries."""

    output = await session.get(Item, unique_name)
    if output is None:
        raise ItemNotFoundError(unique_name)

    target_level = output.enchantment_level
    base_name = _base_unique_name(unique_name)
    resource_style = target_level > 0 and unique_name.startswith(f"{base_name}_LEVEL")
    family_names = [
        enchanted_unique_name(base_name, level, resource_style=resource_style)
        for level in range(target_level + 1)
    ]
    recipes = list(
        await session.scalars(
            select(Recipe)
            .options(selectinload(Recipe.ingredients))
            .where(Recipe.output_item_unique_name.in_(family_names))
        )
    )
    by_level = {recipe.enchantment_level: recipe for recipe in recipes}
    if target_level not in by_level:
        raise RecipeUnavailableError(unique_name)
    return by_level


async def get_recipe_detail(session: AsyncSession, unique_name: str) -> dict:
    output_row = (
        await session.execute(
            select(Item, Recipe)
            .outerjoin(Recipe, Recipe.output_item_unique_name == Item.unique_name)
            .where(Item.unique_name == unique_name)
        )
    ).one_or_none()
    if output_row is None:
        raise ItemNotFoundError(unique_name)

    output_item, recipe = output_row
    if recipe is None:
        raise RecipeUnavailableError(unique_name)

    ingredient_item = aliased(Item)
    has_own_recipe = exists(
        select(Recipe.id).where(
            Recipe.output_item_unique_name == RecipeIngredient.ingredient_unique_name
        )
    )
    ingredient_rows = await session.execute(
        select(
            RecipeIngredient,
            ingredient_item.name_pt,
            ingredient_item.name_en,
            has_own_recipe.label("has_own_recipe"),
        )
        .outerjoin(
            ingredient_item,
            ingredient_item.unique_name == RecipeIngredient.ingredient_unique_name,
        )
        .where(RecipeIngredient.recipe_id == recipe.id)
        .order_by(RecipeIngredient.position)
    )
    ingredients = [
        {
            "position": ingredient.position,
            "unique_name": ingredient.ingredient_unique_name,
            "albion_id": ingredient.ingredient_item_id,
            "name_pt": name_pt,
            "name_en": name_en,
            "count": ingredient.count,
            "enchantment_level": ingredient.enchantment_level,
            "has_own_recipe": has_own_recipe,
        }
        for ingredient, name_pt, name_en, has_own_recipe in ingredient_rows
    ]

    upgrade_resource = None
    if recipe.upgrade_resource_unique_name is not None:
        upgrade_item = await session.get(Item, recipe.upgrade_resource_unique_name)
        upgrade_resource = {
            "unique_name": recipe.upgrade_resource_unique_name,
            "albion_id": recipe.upgrade_resource_item_id,
            "name_pt": upgrade_item.name_pt if upgrade_item is not None else None,
            "name_en": upgrade_item.name_en if upgrade_item is not None else None,
            "count": recipe.upgrade_resource_count,
        }

    base_name = _base_unique_name(unique_name)
    variants = await session.scalars(
        select(Recipe.output_item_unique_name)
        .join(Item, Item.unique_name == Recipe.output_item_unique_name)
        .where(
            Recipe.enchantment_level > 0,
            or_(
                Recipe.output_item_unique_name.startswith(f"{base_name}@", autoescape=True),
                Recipe.output_item_unique_name.startswith(f"{base_name}_LEVEL", autoescape=True),
            ),
        )
        .order_by(Recipe.enchantment_level, Recipe.output_item_unique_name)
    )

    return {
        "output": {
            "unique_name": output_item.unique_name,
            "albion_id": output_item.albion_id,
            "name_pt": output_item.name_pt,
            "name_en": output_item.name_en,
        },
        "enchantment_level": recipe.enchantment_level,
        "production_kind": recipe.production_kind,
        "silver_cost": recipe.silver_cost,
        "crafting_focus": recipe.crafting_focus,
        "amount_crafted": recipe.amount_crafted,
        "craft_time": recipe.craft_time,
        "ingredients": ingredients,
        "upgrade_resource": upgrade_resource,
        "enchanted_variants": list(variants),
    }
