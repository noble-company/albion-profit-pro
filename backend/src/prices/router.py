from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.dependencies import current_active_user
from src.database import get_session
from src.prices.constants import AlbionServer
from src.prices.schemas import DemandOut, ItemPricesOut, PriceSnapshotOut
from src.prices.service import get_item_demand, get_item_prices
from src.prices.snapshot import read_snapshot, to_columnar

router = APIRouter(prefix="/items", tags=["prices"])


@router.get(
    "/{item_id}/prices",
    response_model=ItemPricesOut,
    description=(
        "Global partial observations (`scope=all`), or the combinations limited to the market "
        "sources the authenticated user collected (`scope=mine`). Book and history have "
        "independent coverage; `limit`, `offset` and `location_id` control the slice. The book "
        "sides are `sell` (game offers, the ask) and `buy` (game requests, the bid)."
    ),
)
async def read_item_prices(
    item_id: str,
    server: AlbionServer = Query(...),
    scope: Literal["all", "mine"] = Query("all"),
    location_id: list[str] | None = Query(None),
    quality_level: int | None = Query(None, ge=1, le=5),
    enchantment_level: int | None = Query(None, ge=0, le=4),
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
        quality_level=quality_level,
        enchantment_level=enchantment_level,
        limit=limit,
        offset=offset,
    )
    return ItemPricesOut(server=server, item_id=item_id, scope=scope, **page)


@router.get(
    "/{item_id}/demand",
    response_model=DemandOut,
    description=(
        "Platform-wide demand view. This endpoint takes no `scope`; per-user coverage applies "
        "only to the prices endpoint. `book` is demand parked in the request side, `sold` is "
        "real turnover over three windows, `series_6h` is the raw series for a trend plot."
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


# Router próprio: `router` acima tem prefixo `/items`, e o snapshot é uma leitura de realm, não
# de um item.
snapshot_router = APIRouter(
    prefix="/prices", tags=["prices"], dependencies=[Depends(current_active_user)]
)


@snapshot_router.get(
    "/snapshot",
    response_model=PriceSnapshotOut,
    description=(
        "Top of book for a whole realm, optionally narrowed to specific markets. Returns "
        "**every** combination it has, with no freshness cut-off: each side carries its own "
        "`observed_at` and `source` so the client can decide what to trust and what to hide. "
        "Sides are `sell` (game offers, the ask) and `buy` (game requests, the bid); `null` "
        "means no price, never zero."
    ),
)
async def read_price_snapshot(
    server: AlbionServer = Query(...),
    location_id: list[str] | None = Query(None),
    session: AsyncSession = Depends(get_session),
):
    rows = await read_snapshot(session, server.value, location_id)
    return PriceSnapshotOut(server=server, generated_at=datetime.now(UTC), **to_columnar(rows))
