from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from pydantic import Field
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.dependencies import current_active_user
from src.database import get_session
from src.opportunities.cache import get_cached, set_cached
from src.opportunities.schemas import OpportunityPage
from src.opportunities.service import flip_opportunities
from src.prices.constants import AlbionServer
from src.rate_limit import rate_limited_user

# Endpoint de leitura mais caro do produto. Limite por usuário (não por IP) e por rota — a chave
# do rate limit já inclui o path. fail-open: a queda do cache não deve derrubar a leitura.
_opportunities_rate_limit = Depends(rate_limited_user("rl:opportunities", limit=60, seconds=60))

router = APIRouter(
    prefix="/opportunities",
    tags=["opportunities"],
    dependencies=[Depends(current_active_user), _opportunities_rate_limit],
)

TierValue = Annotated[int, Field(ge=1, le=8)]
EnchantmentValue = Annotated[int, Field(ge=0, le=4)]
QualityValue = Annotated[int, Field(ge=1, le=5)]


def _normalized[T](values: list[T] | None) -> list[T]:
    return sorted(set(values or []))


async def _cached_page(kind: str, params: dict) -> OpportunityPage | None:
    try:
        payload = await get_cached(kind, params)
    except Exception:
        return None
    return OpportunityPage.model_validate(payload) if payload else None


async def _store_page(kind: str, params: dict, page: OpportunityPage) -> None:
    try:
        await set_cached(kind, params, page.model_dump(mode="json"))
    except Exception:
        return


@router.get("/flips", response_model=OpportunityPage)
async def flips(
    server: AlbionServer = Query(...),
    item_id: str | None = Query(None, min_length=1, max_length=64),
    category: str | None = Query(None, max_length=64),
    subcategory: str | None = Query(None, max_length=64),
    subcategory2: str | None = Query(None, max_length=64),
    subcategory3: str | None = Query(None, max_length=64),
    buy_location_id: list[str] | None = Query(None),
    sell_location_id: list[str] | None = Query(None),
    tier: list[TierValue] | None = Query(None),
    enchantment_level: list[EnchantmentValue] | None = Query(None),
    quality_level: list[QualityValue] | None = Query(None),
    max_age_hours: int | None = Query(None, ge=1, le=168),
    require_complete: bool = Query(False),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    min_profit: Decimal | None = Query(None),
    min_roi: Decimal | None = Query(None),
    premium: bool = Query(True),
    buy_order: bool = Query(False),
    sell_order: bool = Query(False),
    sort: Literal["profit", "roi", "freshness"] = Query("profit"),
    direction: Literal["asc", "desc"] = Query("desc"),
    session: AsyncSession = Depends(get_session),
):
    buy_locations = _normalized(buy_location_id)
    sell_locations = _normalized(sell_location_id)
    tiers = _normalized(tier)
    enchantments = _normalized(enchantment_level)
    qualities = _normalized(quality_level)
    cache_params = {
        "server": server.value,
        "item_id": item_id,
        "category": category,
        "subcategory": subcategory,
        "subcategory2": subcategory2,
        "subcategory3": subcategory3,
        "buy_locations": buy_locations,
        "sell_locations": sell_locations,
        "tiers": tiers,
        "enchantments": enchantments,
        "qualities": qualities,
        "max_age_hours": max_age_hours,
        "require_complete": require_complete,
        "limit": limit,
        "offset": offset,
        "min_profit": min_profit,
        "min_roi": min_roi,
        "premium": premium,
        "buy_order": buy_order,
        "sell_order": sell_order,
        "sort": sort,
        "direction": direction,
    }
    cached = await _cached_page("flip", cache_params)
    if cached is not None:
        return cached
    rows, total = await flip_opportunities(
        session,
        server.value,
        item_id=item_id,
        category=category,
        subcategory=subcategory,
        subcategory2=subcategory2,
        subcategory3=subcategory3,
        buy_locations=buy_locations,
        sell_locations=sell_locations,
        tiers=tiers,
        enchantments=enchantments,
        limit=limit,
        offset=offset,
        min_profit=min_profit,
        min_roi=min_roi,
        premium=premium,
        buy_order=buy_order,
        sell_order=sell_order,
        qualities=qualities,
        max_age_hours=max_age_hours,
        require_complete=require_complete,
        sort=sort,
        direction=direction,
    )
    page = OpportunityPage(
        server=server, kind="flip", opportunities=rows, total=total, limit=limit, offset=offset
    )
    await _store_page("flip", cache_params, page)
    return page
