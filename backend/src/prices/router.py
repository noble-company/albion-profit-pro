from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.dependencies import current_active_user
from src.database import get_session
from src.prices.schemas import DemandOut, ItemPricesOut
from src.prices.service import get_item_demand, get_item_prices

router = APIRouter(prefix="/items", tags=["prices"])


@router.get("/{item_id}/prices", response_model=ItemPricesOut)
async def read_item_prices(
    item_id: str,
    scope: Literal["all", "mine"] = Query("all"),
    user=Depends(current_active_user),
    session: AsyncSession = Depends(get_session),
):
    prices = await get_item_prices(
        session, item_id, scope, user_id=user.id if scope == "mine" else None
    )
    return ItemPricesOut(item_id=item_id, scope=scope, prices=prices)


@router.get("/{item_id}/demand", response_model=DemandOut)
async def read_item_demand(
    item_id: str,
    location_id: str = Query(...),
    quality: int = Query(...),
    # não faz parte do exemplo da spec da task 31, mas query_book_depth precisa dessa
    # dimensão pra montar a combinação — default 0 cobre a maioria dos itens.
    enchantment_level: int = Query(0),
    user=Depends(current_active_user),
    session: AsyncSession = Depends(get_session),
):
    demand = await get_item_demand(session, item_id, location_id, quality, enchantment_level)
    return DemandOut(**demand)
