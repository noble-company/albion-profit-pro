from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.dependencies import current_active_user
from src.database import get_session
from src.items.schemas import CategoryOut, ItemCatalogOut, LocationOut
from src.items.service import get_item_detail, list_categories, list_locations, search_items

router = APIRouter(tags=["items"], dependencies=[Depends(current_active_user)])


@router.get("/items/search", response_model=list[ItemCatalogOut])
async def search_item_catalog(
    q: str = Query(..., min_length=1, max_length=100),
    tier: int | None = Query(None, ge=1, le=8),
    enchantment_level: int | None = Query(None, ge=0, le=4),
    categoria: str | None = Query(None, min_length=1, max_length=64),
    apenas_craftaveis: bool = Query(False),
    limit: int = Query(20, ge=1, le=50),
    session: AsyncSession = Depends(get_session),
):
    query = q.strip()
    if not query:
        raise HTTPException(status_code=422, detail="termo_de_busca_vazio")
    return await search_items(
        session,
        query=query,
        tier=tier,
        enchantment_level=enchantment_level,
        category=categoria,
        craftable_only=apenas_craftaveis,
        limit=limit,
    )


@router.get("/locations", response_model=list[LocationOut])
async def read_locations(session: AsyncSession = Depends(get_session)):
    return await list_locations(session)


@router.get("/items/categories", response_model=list[CategoryOut])
async def read_categories(session: AsyncSession = Depends(get_session)):
    return await list_categories(session)


@router.get("/items/{unique_name}", response_model=ItemCatalogOut)
async def read_item(unique_name: str, session: AsyncSession = Depends(get_session)):
    item = await get_item_detail(session, unique_name)
    if item is None:
        raise HTTPException(status_code=404, detail="item_nao_encontrado")
    return item
