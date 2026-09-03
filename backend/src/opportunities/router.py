from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.dependencies import current_active_user
from src.database import get_session
from src.opportunities.cache import get_cached, set_cached
from src.opportunities.schemas import OpportunityPage
from src.opportunities.service import flip_opportunities, recipe_opportunities
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
    location_id: list[str] | None = Query(None),
    tier: int | None = Query(None, ge=1, le=8),
    enchantment_level: int | None = Query(None, ge=0, le=4),
    quality_level: int | None = Query(None, ge=1, le=5),
    max_age_hours: int | None = Query(None, ge=1, le=168),
    require_complete: bool = Query(False),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    min_profit: Decimal | None = Query(None),
    min_roi: Decimal | None = Query(None),
    premium: bool = Query(True),
    buy_order: bool = Query(False),
    sell_order: bool = Query(False),
    session: AsyncSession = Depends(get_session),
):
    cache_params = {
        "server": server.value,
        "item_id": item_id,
        "category": category,
        "subcategory": subcategory,
        "subcategory2": subcategory2,
        "subcategory3": subcategory3,
        "locations": location_id or [],
        "tier": tier,
        "enchantment": enchantment_level,
        "quality": quality_level,
        "max_age_hours": max_age_hours,
        "require_complete": require_complete,
        "limit": limit,
        "offset": offset,
        "min_profit": min_profit,
        "min_roi": min_roi,
        "premium": premium,
        "buy_order": buy_order,
        "sell_order": sell_order,
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
        locations=location_id or [],
        tier=tier,
        enchantment=enchantment_level,
        limit=limit,
        offset=offset,
        min_profit=min_profit,
        min_roi=min_roi,
        premium=premium,
        buy_order=buy_order,
        sell_order=sell_order,
        quality=quality_level,
        max_age_hours=max_age_hours,
        require_complete=require_complete,
    )
    page = OpportunityPage(
        server=server, kind="flip", opportunities=rows, total=total, limit=limit, offset=offset
    )
    await _store_page("flip", cache_params, page)
    return page


async def _production_page(
    *,
    kind: str,
    server: AlbionServer,
    location_id: list[str] | None,
    tier: int | None,
    enchantment_level: int | None,
    quality_level: int | None,
    max_age_hours: int | None,
    require_complete: bool,
    limit: int,
    offset: int,
    min_profit: Decimal | None,
    min_roi: Decimal | None,
    return_rate: Decimal,
    station_cost_per_execution: Decimal,
    use_focus: bool,
    premium: bool,
    item_id: str | None,
    session: AsyncSession,
) -> OpportunityPage:
    cache_params = {
        "server": server.value,
        "item_id": item_id,
        "locations": location_id or [],
        "tier": tier,
        "enchantment": enchantment_level,
        "quality": quality_level,
        "max_age_hours": max_age_hours,
        "require_complete": require_complete,
        "limit": limit,
        "offset": offset,
        "min_profit": min_profit,
        "min_roi": min_roi,
        "return_rate": return_rate,
        "station_cost_per_execution": station_cost_per_execution,
        "use_focus": use_focus,
        "premium": premium,
    }
    cached = await _cached_page(kind, cache_params)
    if cached is not None:
        return cached
    rows, total, coverage = await recipe_opportunities(
        session,
        server,
        kind=kind,
        locations=location_id or [],
        tier=tier,
        enchantment=enchantment_level,
        limit=limit,
        offset=offset,
        min_profit=min_profit,
        min_roi=min_roi,
        quality=quality_level,
        max_age_hours=max_age_hours,
        require_complete=require_complete,
        return_rate=return_rate,
        station_cost_per_execution=station_cost_per_execution,
        use_focus=use_focus,
        premium=premium,
        item_id=item_id,
    )
    page = OpportunityPage(
        server=server,
        kind=kind,
        opportunities=rows,
        total=total,
        limit=limit,
        offset=offset,
        coverage=coverage,
    )
    await _store_page(kind, cache_params, page)
    return page


@router.get("/refining", response_model=OpportunityPage)
async def refining(
    server: AlbionServer = Query(...),
    item_id: str | None = Query(None, min_length=1, max_length=64),
    location_id: list[str] | None = Query(None),
    tier: int | None = Query(None, ge=1, le=8),
    enchantment_level: int | None = Query(None, ge=0, le=4),
    quality_level: int | None = Query(None, ge=1, le=5),
    max_age_hours: int | None = Query(None, ge=1, le=168),
    require_complete: bool = Query(False),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    min_profit: Decimal | None = Query(None),
    min_roi: Decimal | None = Query(None),
    return_rate: Decimal = Query(Decimal("0"), ge=0, le=1),
    station_cost_per_execution: Decimal = Query(Decimal("0"), ge=0),
    use_focus: bool = Query(False),
    premium: bool = Query(True),
    session: AsyncSession = Depends(get_session),
):
    return await _production_page(
        kind="refining",
        server=server,
        item_id=item_id,
        location_id=location_id,
        tier=tier,
        enchantment_level=enchantment_level,
        quality_level=quality_level,
        max_age_hours=max_age_hours,
        require_complete=require_complete,
        limit=limit,
        offset=offset,
        min_profit=min_profit,
        min_roi=min_roi,
        return_rate=return_rate,
        station_cost_per_execution=station_cost_per_execution,
        use_focus=use_focus,
        premium=premium,
        session=session,
    )


@router.get("/crafting", response_model=OpportunityPage)
async def crafting(
    server: AlbionServer = Query(...),
    item_id: str | None = Query(None, min_length=1, max_length=64),
    location_id: list[str] | None = Query(None),
    tier: int | None = Query(None, ge=1, le=8),
    enchantment_level: int | None = Query(None, ge=0, le=4),
    quality_level: int | None = Query(None, ge=1, le=5),
    max_age_hours: int | None = Query(None, ge=1, le=168),
    require_complete: bool = Query(False),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    min_profit: Decimal | None = Query(None),
    min_roi: Decimal | None = Query(None),
    return_rate: Decimal = Query(Decimal("0"), ge=0, le=1),
    station_cost_per_execution: Decimal = Query(Decimal("0"), ge=0),
    use_focus: bool = Query(False),
    premium: bool = Query(True),
    session: AsyncSession = Depends(get_session),
):
    return await _production_page(
        kind="crafting",
        server=server,
        item_id=item_id,
        location_id=location_id,
        tier=tier,
        enchantment_level=enchantment_level,
        quality_level=quality_level,
        max_age_hours=max_age_hours,
        require_complete=require_complete,
        limit=limit,
        offset=offset,
        min_profit=min_profit,
        min_roi=min_roi,
        return_rate=return_rate,
        station_cost_per_execution=station_cost_per_execution,
        use_focus=use_focus,
        premium=premium,
        session=session,
    )
