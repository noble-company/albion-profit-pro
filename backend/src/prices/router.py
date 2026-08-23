from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.dependencies import current_active_user
from src.database import get_session
from src.prices.constants import AlbionServer
from src.prices.schemas import DemandOut, ItemPricesOut
from src.prices.service import get_item_demand, get_item_prices

router = APIRouter(prefix="/items", tags=["prices"])


@router.get(
    "/{item_id}/prices",
    response_model=ItemPricesOut,
    description=(
        "Consulta observações parciais globais (`scope=all`) ou limita as combinações às "
        "fontes de mercado que o usuário autenticado coletou (`scope=mine`). Livro e histórico "
        "têm coberturas independentes; `limit`, `offset` e `location_id` controlam o recorte."
    ),
)
async def read_item_prices(
    item_id: str,
    server: AlbionServer = Query(...),
    scope: Literal["all", "mine"] = Query("all"),
    location_id: list[str] | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    user=Depends(current_active_user),
    session: AsyncSession = Depends(get_session),
):
    page = await get_item_prices(
        session,
        server.value,
        item_id,
        scope,
        user_id=user.id if scope == "mine" else None,
        location_ids=location_id,
        limit=limit,
        offset=offset,
    )
    return ItemPricesOut(server=server, item_id=item_id, scope=scope, **page)


@router.get(
    "/{item_id}/demand",
    response_model=DemandOut,
    description=(
        "Consulta a visão global de demanda da plataforma. Este endpoint não aceita `scope`; "
        "a cobertura por usuário aplica-se somente ao endpoint de preços."
    ),
)
async def read_item_demand(
    item_id: str,
    server: AlbionServer = Query(...),
    location_id: str = Query(...),
    quality: int = Query(...),
    # O encantamento completa a identidade da combinação; zero cobre itens não encantados.
    enchantment_level: int = Query(0),
    user=Depends(current_active_user),
    session: AsyncSession = Depends(get_session),
):
    demand = await get_item_demand(
        session, server.value, item_id, location_id, quality, enchantment_level
    )
    return DemandOut(**demand)
