from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.dependencies import current_active_user
from src.database import get_session
from src.recipes.schemas import RecipeOut
from src.recipes.service import ItemNotFoundError, RecipeUnavailableError, get_recipe_detail

router = APIRouter(tags=["recipes"], dependencies=[Depends(current_active_user)])


@router.get("/items/{unique_name}/recipe", response_model=RecipeOut)
async def read_recipe(unique_name: str, session: AsyncSession = Depends(get_session)):
    try:
        return await get_recipe_detail(session, unique_name)
    except ItemNotFoundError as exc:
        raise HTTPException(status_code=404, detail="item_nao_encontrado") from exc
    except RecipeUnavailableError as exc:
        raise HTTPException(status_code=404, detail="receita_indisponivel") from exc
