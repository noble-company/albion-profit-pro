import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.recipes.models import Recipe
from src.saved_crafts.models import SavedCraft
from src.saved_crafts.schemas import SavedCraftCreate

MAX_SAVED_CRAFTS_PER_REALM = 200


class SavedCraftLimitReached(Exception):
    """O usuário atingiu o limite de receitas salvas neste realm."""


class SavedCraftRecipeUnavailable(Exception):
    """A saída não corresponde a uma receita de craft ou refino do catálogo atual."""


async def list_saved_crafts(
    session: AsyncSession, user_id: uuid.UUID, server: str
) -> list[SavedCraft]:
    rows = await session.scalars(
        select(SavedCraft)
        .where(SavedCraft.user_id == user_id, SavedCraft.server == server)
        .order_by(SavedCraft.updated_at.desc(), SavedCraft.id)
    )
    return list(rows.all())


async def create_saved_craft(
    session: AsyncSession, user_id: uuid.UUID, payload: SavedCraftCreate
) -> SavedCraft:
    recipe_exists = await session.scalar(
        select(Recipe.id).where(
            Recipe.output_item_unique_name == payload.output_item,
            Recipe.production_kind.in_(("crafting", "refining")),
        )
    )
    if recipe_exists is None:
        raise SavedCraftRecipeUnavailable

    total = await session.scalar(
        select(func.count())
        .select_from(SavedCraft)
        .where(SavedCraft.user_id == user_id, SavedCraft.server == payload.server)
    )
    if int(total or 0) >= MAX_SAVED_CRAFTS_PER_REALM:
        raise SavedCraftLimitReached

    saved = SavedCraft(user_id=user_id, **payload.model_dump())
    session.add(saved)
    await session.commit()
    await session.refresh(saved)
    return saved


async def delete_saved_craft(
    session: AsyncSession, user_id: uuid.UUID, saved_craft_id: uuid.UUID
) -> bool:
    saved = await session.scalar(
        select(SavedCraft).where(SavedCraft.id == saved_craft_id, SavedCraft.user_id == user_id)
    )
    if saved is None:
        return False
    await session.delete(saved)
    await session.commit()
    return True
