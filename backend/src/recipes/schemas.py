from decimal import Decimal
from typing import Literal

from pydantic import BaseModel


class RecipeItemOut(BaseModel):
    unique_name: str
    albion_id: int | None
    name_pt: str | None
    name_en: str | None


class RecipeIngredientOut(RecipeItemOut):
    position: int
    count: int
    enchantment_level: int
    return_eligible: bool
    has_own_recipe: bool


class RecipeUpgradeResourceOut(RecipeItemOut):
    count: int


class RecipeOut(BaseModel):
    output: RecipeItemOut
    enchantment_level: int
    production_kind: Literal["refining", "crafting"]
    silver_cost: Decimal
    crafting_focus: int
    amount_crafted: int
    craft_time: Decimal
    ingredients: list[RecipeIngredientOut]
    upgrade_resource: RecipeUpgradeResourceOut | None
    enchanted_variants: list[str]
