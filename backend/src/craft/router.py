from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.dependencies import current_active_user
from src.craft.compare_service import compare_craft
from src.craft.schemas import (
    CraftCompareOut,
    CraftCompareRequest,
    CraftSimulationOut,
    CraftSimulationRequest,
)
from src.craft.service import InvalidOverrideError, simulate_craft
from src.database import get_session
from src.recipes.service import ItemNotFoundError, RecipeUnavailableError

router = APIRouter(prefix="/craft", tags=["craft"])


@router.post("/simulate", response_model=CraftSimulationOut)
async def simulate(
    request: CraftSimulationRequest,
    user=Depends(current_active_user),
    session: AsyncSession = Depends(get_session),
):
    try:
        return await simulate_craft(session, request, user.id)
    except ItemNotFoundError as exc:
        raise HTTPException(status_code=404, detail="item_nao_encontrado") from exc
    except RecipeUnavailableError as exc:
        raise HTTPException(status_code=404, detail="receita_indisponivel") from exc
    except InvalidOverrideError as exc:
        raise HTTPException(status_code=422, detail="override_invalido") from exc


@router.post("/compare", response_model=CraftCompareOut)
async def compare(
    request: CraftCompareRequest,
    user=Depends(current_active_user),
    session: AsyncSession = Depends(get_session),
):
    try:
        return await compare_craft(session, request, user.id)
    except ItemNotFoundError as exc:
        raise HTTPException(status_code=404, detail="item_nao_encontrado") from exc
    except RecipeUnavailableError as exc:
        raise HTTPException(status_code=404, detail="receita_indisponivel") from exc
    except InvalidOverrideError as exc:
        raise HTTPException(status_code=422, detail="override_invalido") from exc
