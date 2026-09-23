import uuid

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.dependencies import current_active_user
from src.auth.models import User
from src.database import get_session
from src.saved_crafts.schemas import Realm, SavedCraftCreate, SavedCraftOut
from src.saved_crafts.service import (
    SavedCraftLimitReached,
    SavedCraftRecipeUnavailable,
    create_saved_craft,
    delete_saved_craft,
    list_saved_crafts,
)

router = APIRouter(prefix="/me/saved-crafts", tags=["saved-crafts"])


@router.get("", response_model=list[SavedCraftOut])
async def get_saved_crafts(
    server: Realm,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_session),
):
    return await list_saved_crafts(session, user.id, server)


@router.post("", response_model=SavedCraftOut, status_code=201)
async def post_saved_craft(
    payload: SavedCraftCreate,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_session),
):
    try:
        return await create_saved_craft(session, user.id, payload)
    except SavedCraftRecipeUnavailable:
        raise HTTPException(status_code=422, detail="recipe_unavailable") from None
    except SavedCraftLimitReached:
        raise HTTPException(status_code=409, detail="saved_craft_limit_reached") from None


@router.delete("/{saved_craft_id}", status_code=204)
async def remove_saved_craft(
    saved_craft_id: uuid.UUID,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_session),
):
    if not await delete_saved_craft(session, user.id, saved_craft_id):
        raise HTTPException(status_code=404, detail="saved_craft_not_found")
    return Response(status_code=204)
