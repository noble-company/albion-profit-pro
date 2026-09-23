from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.dependencies import current_active_user
from src.database import get_session
from src.prices.constants import AlbionServer
from src.prices.sales import read_sales
from src.prices.schemas import DemandOut, ItemPricesOut, PriceSnapshotOut, SalesOut
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

MAX_OUTPUT_ITEMS = 200


def _normalizar_output_items(output_items: list[str] | None) -> list[str] | None:
    if output_items is None:
        return None
    if len(output_items) > MAX_OUTPUT_ITEMS:
        raise HTTPException(status_code=422, detail="output_item accepts at most 200 values")

    normalizados: set[str] = set()
    for bruto in output_items:
        item = bruto.strip()
        if not item:
            raise HTTPException(status_code=422, detail="output_item cannot be blank")
        normalizados.add(item)
    return sorted(normalizados)


@snapshot_router.get(
    "/snapshot",
    response_model=PriceSnapshotOut,
    description=(
        "Top of book for a whole realm, optionally narrowed to specific markets. Returns "
        "**every** combination it has, with no freshness cut-off: each side carries its own "
        "`observed_at` and `source` so the client can decide what to trust and what to hide. "
        "Sides are `sell` (game offers, the ask) and `buy` (game requests, the bid); `null` "
        "means no price, never zero. Pass `kind` + `category` (and optionally `subcategory`) to "
        "narrow the rows to the items the recipes of that shop category need: outputs, "
        "ingredients and upgrade resources. For `refining` the category is the family "
        "(`shop_subcategory2`); a recipe whose output has no category lives under `other`. "
        "`consumables` reads the crafting recipes of the food & potions screen: the category is "
        "the consumable subcategory and the subcategory is the family; `insumos` groups the "
        "kitchen inputs (`fishsauce`, `farmingproducts`)."
        " Alternatively, repeat `output_item` to request specific recipe outputs and all items "
        "those recipes need; it cannot be combined with category filters."
    ),
)
async def read_price_snapshot(
    server: AlbionServer = Query(...),
    location_id: list[str] | None = Query(None),
    kind: Literal["refining", "crafting", "consumables"] | None = Query(None),
    category: str | None = Query(None),
    subcategory: str | None = Query(None),
    output_item: list[str] | None = Query(None),
    session: AsyncSession = Depends(get_session),
):
    output_items = _validar_recorte(kind, category, subcategory, output_item)

    rows = await read_snapshot(
        session,
        server.value,
        location_id,
        kind=kind,
        category=category,
        subcategory=subcategory,
        output_items=output_items,
    )
    return PriceSnapshotOut(server=server, generated_at=datetime.now(UTC), **to_columnar(rows))


def _validar_recorte(
    kind: str | None,
    category: str | None,
    subcategory: str | None,
    output_items: list[str] | None = None,
) -> list[str] | None:
    """A mesma `category` significa coisas diferentes no refino (família) e no craft. Sem `kind`
    não há como resolver os itens — e devolver o realm inteiro esconderia o erro do cliente atrás
    de uma resposta que funciona, só que muitas vezes maior (tasks 4/22 e 4/23)."""
    if subcategory is not None and category is None:
        raise HTTPException(status_code=422, detail="subcategory requires category")
    if category is not None and kind is None:
        raise HTTPException(status_code=422, detail="category requires kind")
    normalizados = _normalizar_output_items(output_items)
    if normalizados is not None and any(
        value is not None for value in (kind, category, subcategory)
    ):
        raise HTTPException(
            status_code=422,
            detail="output_item cannot be combined with category filters",
        )
    return normalizados


@snapshot_router.get(
    "/sales",
    response_model=SalesOut,
    description=(
        "Units sold per day, averaged over the last 7 complete UTC days, per item, market and "
        "quality. Built from the daily rollup, which merges our client's history with the public "
        "Albion Data Project history. Pass `kind` + `category` (and optionally `subcategory`) to "
        "narrow the rows to the outputs of that shop category. An item without history is "
        "absent, never zero. Alternatively, repeat `output_item` to request only those outputs; "
        "it cannot be combined with category filters."
    ),
)
async def read_sales_volume(
    server: AlbionServer = Query(...),
    kind: Literal["refining", "crafting", "consumables"] | None = Query(None),
    category: str | None = Query(None),
    subcategory: str | None = Query(None),
    output_item: list[str] | None = Query(None),
    session: AsyncSession = Depends(get_session),
):
    output_items = _validar_recorte(kind, category, subcategory, output_item)
    vendas = await read_sales(
        session,
        server.value,
        kind=kind,
        category=category,
        subcategory=subcategory,
        output_items=output_items,
    )
    return SalesOut(server=server, **vendas)
