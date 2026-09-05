"""Materialized production ranking (``B02``).

`rebuild_ranking` evaluates **every** eligible recipe with the shared calc core in neutral
parameters and stores the components. `read_recipe_ranking` serves `/opportunities/refining`
and `/crafting` by indexed read: filter, order and paginate in PostgreSQL, then a cheap
premium/tax/return/station projection over the page only.
"""

import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import structlog
from sqlalchemy import func, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.craft import constants
from src.craft.formulas import calculate_percentage_charge
from src.craft.schemas import CraftSimulationRequest
from src.craft.service import simulate_craft
from src.items.models import Item, Location
from src.items.normalization import normalize_item_search
from src.opportunities.models import RecipeRanking, RecipeRankingRun
from src.opportunities.schemas import OpportunityOut, RankingCoverage
from src.opportunities.sorting import apply_order
from src.prices.constants import AlbionServer
from src.prices.models import MarketOrder
from src.prices.service import latest_order_observation_filter
from src.recipes.models import Recipe, RecipeIngredient

log = structlog.get_logger()

# Reconstrução agendada a cada 10 min (beat). O payload marca ``stale`` quando a última
# reconstrução passou desta janela — a UI mostra o aviso, nunca serve como atual.
RANKING_STALENESS_LIMIT = timedelta(minutes=15)

_ZERO = Decimal("0")
_SENTINEL_USER = uuid.UUID(int=0)


def _min_dt(values: list[datetime | None]) -> datetime | None:
    real = [v for v in values if v is not None]
    return min(real) if real else None


@dataclass(frozen=True, slots=True)
class _Components:
    executions: int
    produced_quantity: int
    recipe_silver_cost: int
    crafting_focus: int
    amount_crafted: int
    ingredient_cost_immediate: Decimal | None
    ingredient_cost_order: Decimal | None
    output_gross_immediate: Decimal | None
    output_gross_order: Decimal | None
    ingredients_oldest_observed_at: datetime | None
    output_immediate_observed_at: datetime | None
    output_order_observed_at: datetime | None
    ingredients: list[dict]
    warnings: list[str]


def _extract_components(simulation: dict) -> _Components:
    by_acq: dict[str, dict] = {}
    by_sale: dict[str, dict] = {}
    neutral_warnings: list[str] = []
    for scenario in simulation["scenarios"]:
        by_acq.setdefault(str(scenario["acquisition_mode"]), scenario)
        by_sale.setdefault(str(scenario["sale_mode"]), scenario)
        if (
            str(scenario["acquisition_mode"]) == "immediate"
            and str(scenario["sale_mode"]) == "immediate"
        ):
            neutral_warnings = sorted({str(w) for w in scenario["warnings"]})

    def _ing_cost(mode: str) -> Decimal | None:
        scenario = by_acq.get(mode)
        return scenario["costs"]["ingredient_cost"] if scenario else None

    def _out_gross(mode: str) -> Decimal | None:
        scenario = by_sale.get(mode)
        return scenario["revenue"]["gross_revenue"] if scenario else None

    ingredients = [
        {
            "item": ingredient["unique_name"],
            "item_name": ingredient.get("item_name"),
            "gross_quantity": ingredient["gross_quantity"],
            "expected_return_quantity": "0",
            "purchase_quantity": ingredient["purchase_quantity"],
        }
        for ingredient in simulation["ingredients"]
    ]
    ingredient_observed = _min_dt(
        [ing["immediate_purchase"]["oldest_observed_at"] for ing in simulation["ingredients"]]
        + [ing["buy_order"]["oldest_observed_at"] for ing in simulation["ingredients"]]
    )
    return _Components(
        executions=simulation["executions"],
        produced_quantity=simulation["produced_quantity"],
        recipe_silver_cost=simulation["recipe"]["silver_cost_per_execution"],
        crafting_focus=simulation["recipe"]["crafting_focus_per_execution"],
        amount_crafted=simulation["recipe"]["amount_crafted"],
        ingredient_cost_immediate=_ing_cost("immediate"),
        ingredient_cost_order=_ing_cost("buy_order"),
        output_gross_immediate=_out_gross("immediate"),
        output_gross_order=_out_gross("sell_order"),
        ingredients_oldest_observed_at=ingredient_observed,
        output_immediate_observed_at=simulation["output_quotes"]["immediate_sale"][
            "oldest_observed_at"
        ],
        output_order_observed_at=simulation["output_quotes"]["sell_order"]["oldest_observed_at"],
        ingredients=ingredients,
        warnings=neutral_warnings,
    )


def _neutral_profit_roi(
    components: _Components,
) -> tuple[Decimal | None, Decimal | None]:
    if components.ingredient_cost_immediate is None or components.output_gross_immediate is None:
        return None, None
    recipe_total = Decimal(components.recipe_silver_cost) * components.executions
    base_cost = components.ingredient_cost_immediate + recipe_total
    profit = components.output_gross_immediate - base_cost
    roi = (profit / base_cost * 100) if base_cost > 0 else None
    return profit, (round(roi, 4) if roi is not None else None)


async def rebuild_ranking(session: AsyncSession, server: str) -> RecipeRankingRun:
    """Recompute the whole ranking for one realm. Idempotent; runs in one locked transaction."""
    started = time.monotonic()

    total_recipes = int(await session.scalar(select(func.count()).select_from(Recipe)) or 0)

    city_ids = [
        row[0]
        for row in await session.execute(
            select(Location.location_id).where(Location.kind == "city", Location.name.is_not(None))
        )
    ]

    output_meta = {
        item.unique_name: item
        for item in (
            await session.scalars(
                select(Item).join(Recipe, Recipe.output_item_unique_name == Item.unique_name)
            )
        )
    }
    output_kind = {
        output_item: kind
        for output_item, kind in await session.execute(
            select(Recipe.output_item_unique_name, Recipe.production_kind).distinct()
        )
    }
    ingredient_names = {
        unique_name: (name_pt or name_en)
        for unique_name, name_pt, name_en in await session.execute(
            select(Item.unique_name, Item.name_pt, Item.name_en).where(
                Item.unique_name.in_(select(RecipeIngredient.ingredient_unique_name).distinct())
            )
        )
    }

    eligible = (
        select(
            MarketOrder.item_id,
            MarketOrder.location_id,
            MarketOrder.quality_level,
        )
        .join(Recipe, Recipe.output_item_unique_name == MarketOrder.item_id)
        .where(
            MarketOrder.server_id == server,
            MarketOrder.location_id.in_(city_ids),
            MarketOrder.auction_type.in_(["offer", "request"]),
            latest_order_observation_filter(),
        )
        .distinct()
    )
    combos = [tuple(row) for row in await session.execute(eligible)]

    rows: list[dict] = []
    evaluated: set[str] = set()
    priced: set[str] = set()
    now = datetime.now(timezone.utc)
    for output_item, location_id, output_quality in combos:
        item = output_meta.get(output_item)
        if item is None:
            continue
        try:
            simulation = await simulate_craft(
                session,
                CraftSimulationRequest(
                    server=AlbionServer(server),
                    output_item=output_item,
                    location_id=location_id,
                    quantity=1,
                    output_quality=output_quality,
                    scope="all",
                    return_rate=_ZERO,
                    station_cost_per_execution=_ZERO,
                    use_focus=False,
                    premium=True,
                    sales_tax_rate=_ZERO,
                    setup_fee_rate=_ZERO,
                ),
                _SENTINEL_USER,
            )
        except (LookupError, ValueError):
            continue

        components = _extract_components(simulation)
        for ingredient in components.ingredients:
            ingredient["item_name"] = ingredient_names.get(ingredient["item"])
        neutral_profit, neutral_roi = _neutral_profit_roi(components)
        evaluated.add(output_item)
        if neutral_profit is not None:
            priced.add(output_item)
        rows.append(
            {
                "server_id": server,
                "output_item_unique_name": output_item,
                "location_id": location_id,
                "output_quality": output_quality,
                "enchantment_level": item.enchantment_level or 0,
                "tier": item.tier,
                "is_refining": output_kind.get(output_item) == "refining",
                "recipe_silver_cost": components.recipe_silver_cost,
                "crafting_focus": components.crafting_focus,
                "amount_crafted": components.amount_crafted,
                "executions": components.executions,
                "produced_quantity": components.produced_quantity,
                "ingredient_cost_immediate": components.ingredient_cost_immediate,
                "ingredient_cost_order": components.ingredient_cost_order,
                "output_gross_immediate": components.output_gross_immediate,
                "output_gross_order": components.output_gross_order,
                "ingredients": components.ingredients,
                "ingredients_oldest_observed_at": components.ingredients_oldest_observed_at,
                "output_immediate_observed_at": components.output_immediate_observed_at,
                "output_order_observed_at": components.output_order_observed_at,
                "warnings": components.warnings,
                "neutral_profit": neutral_profit,
                "neutral_roi": neutral_roi,
                "computed_at": now,
            }
        )

    await session.execute(
        select(func.pg_advisory_xact_lock(func.hashtext(f"recipe_ranking:{server}")))
    )
    await session.execute(RecipeRanking.__table__.delete().where(RecipeRanking.server_id == server))
    if rows:
        await session.execute(RecipeRanking.__table__.insert(), rows)

    duration_ms = int((time.monotonic() - started) * 1000)
    run_values = {
        "server_id": server,
        "computed_at": now,
        "duration_ms": duration_ms,
        "evaluated_recipes": len(evaluated),
        "priced_recipes": len(priced),
        "total_recipes": total_recipes,
        "ranking_rows": len(rows),
    }
    await session.execute(
        pg_insert(RecipeRankingRun)
        .values(run_values)
        .on_conflict_do_update(
            constraint="uq_recipe_ranking_run_server",
            set_={k: v for k, v in run_values.items() if k != "server_id"},
        )
    )
    await session.commit()

    log.info("opportunities.ranking_reconstruido", **run_values)
    return RecipeRankingRun(**run_values)


def _project_row(
    row: RecipeRanking,
    *,
    premium: bool,
    return_rate: Decimal,
    station_cost_per_execution: Decimal,
    use_focus: bool,
) -> dict | None:
    """Cheap premium/tax/return/station projection over one ranking row.

    ``return_rate`` scaling of the ingredient cost is a linear approximation; the exact
    recompute is ``POST /craft/simulate`` (detail) and the client "e se" layer (task 23).
    """
    sales_tax_rate = (
        constants.DEFAULT_PREMIUM_SALES_TAX_RATE
        if premium
        else constants.DEFAULT_NON_PREMIUM_SALES_TAX_RATE
    )
    setup_fee_rate = constants.DEFAULT_SETUP_FEE_RATE
    recipe_total = Decimal(row.recipe_silver_cost) * row.executions
    station_total = station_cost_per_execution * row.executions
    return_factor = Decimal("1") - return_rate

    best: dict | None = None
    acq_options = [
        ("immediate", row.ingredient_cost_immediate, row.ingredients_oldest_observed_at),
        ("buy_order", row.ingredient_cost_order, row.ingredients_oldest_observed_at),
    ]
    sale_options = [
        ("immediate", row.output_gross_immediate, row.output_immediate_observed_at),
        ("sell_order", row.output_gross_order, row.output_order_observed_at),
    ]
    for acq_mode, ing_cost, ing_seen in acq_options:
        if ing_cost is None:
            continue
        projected_ingredient_cost = Decimal(ing_cost) * return_factor
        acq_setup = (
            calculate_percentage_charge(projected_ingredient_cost, setup_fee_rate)
            if acq_mode == "buy_order"
            else _ZERO
        )
        total_cost = projected_ingredient_cost + recipe_total + station_total + acq_setup
        for sale_mode, gross, out_seen in sale_options:
            if gross is None:
                continue
            gross = Decimal(gross)
            sales_tax = calculate_percentage_charge(gross, sales_tax_rate)
            sale_setup = (
                calculate_percentage_charge(gross, setup_fee_rate)
                if sale_mode == "sell_order"
                else _ZERO
            )
            net_revenue = gross - sales_tax - sale_setup
            profit = net_revenue - total_cost
            roi = (profit / total_cost * 100) if total_cost > 0 else None
            candidate = {
                "acquisition_mode": acq_mode,
                "sale_mode": sale_mode,
                "gross_revenue": gross,
                "sales_tax": sales_tax,
                "sale_setup_fee": sale_setup,
                "net_revenue": net_revenue,
                "acquisition_setup_fee": acq_setup,
                "total_fees": sales_tax + sale_setup + acq_setup,
                "total_cost": total_cost,
                "profit": profit,
                "roi": round(roi, 4) if roi is not None else None,
                "oldest_observed_at": _min_dt([ing_seen, out_seen]),
            }
            if best is None or candidate["profit"] > best["profit"]:
                best = candidate
    if best is None:
        return None
    best["focus_consumed"] = row.crafting_focus * row.executions if use_focus else 0
    best["station_cost"] = station_total
    return best


async def read_recipe_ranking(
    session: AsyncSession,
    server: str,
    *,
    kind: str,
    locations: list[str],
    tier: int | None,
    enchantment: int | None,
    limit: int,
    offset: int,
    min_profit: Decimal | None,
    min_roi: Decimal | None,
    quality: int | None = None,
    max_age_hours: int | None = None,
    require_complete: bool = False,
    return_rate: Decimal = _ZERO,
    station_cost_per_execution: Decimal = _ZERO,
    use_focus: bool = False,
    premium: bool = True,
    item_id: str | None = None,
    sort: str = "profit",
    direction: str = "desc",
) -> tuple[list[OpportunityOut], int, RankingCoverage]:
    is_refining = kind == "refining"
    conditions = [
        RecipeRanking.server_id == server,
        RecipeRanking.is_refining.is_(is_refining),
    ]
    if locations:
        conditions.append(RecipeRanking.location_id.in_(locations))
    if tier is not None:
        conditions.append(RecipeRanking.tier == tier)
    if enchantment is not None:
        conditions.append(RecipeRanking.enchantment_level == enchantment)
    if quality is not None:
        conditions.append(RecipeRanking.output_quality == quality)
    if min_profit is not None:
        conditions.append(RecipeRanking.neutral_profit >= min_profit)
    if min_roi is not None:
        conditions.append(RecipeRanking.neutral_roi >= min_roi)
    if require_complete:
        conditions.append(RecipeRanking.neutral_profit.is_not(None))
        conditions.append(RecipeRanking.warnings == [])
    if max_age_hours is not None:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=max_age_hours)
        freshest_relevant = func.least(
            RecipeRanking.ingredients_oldest_observed_at,
            RecipeRanking.output_immediate_observed_at,
        )
        conditions.append(freshest_relevant >= cutoff)
    if item_id:
        normalized = normalize_item_search(item_id)
        conditions.append(
            or_(
                RecipeRanking.output_item_unique_name == item_id,
                Item.busca_normalizada.contains(normalized, autoescape=True),
            )
        )

    total = int(
        await session.scalar(
            select(func.count())
            .select_from(RecipeRanking)
            .join(Item, Item.unique_name == RecipeRanking.output_item_unique_name)
            .where(*conditions)
        )
        or 0
    )

    freshest = func.least(
        RecipeRanking.ingredients_oldest_observed_at,
        RecipeRanking.output_immediate_observed_at,
    )
    order_by = apply_order(
        {
            "profit": RecipeRanking.neutral_profit,
            "roi": RecipeRanking.neutral_roi,
            "freshness": freshest,
        },
        [
            RecipeRanking.output_item_unique_name.asc(),
            RecipeRanking.location_id.asc(),
            RecipeRanking.output_quality.asc(),
        ],
        sort,
        direction,
    )
    page = (
        select(RecipeRanking, Item.name_pt, Item.name_en)
        .join(Item, Item.unique_name == RecipeRanking.output_item_unique_name)
        .where(*conditions)
        .order_by(*order_by)
        .limit(limit)
        .offset(offset)
    )

    opportunities: list[OpportunityOut] = []
    for row, name_pt, name_en in await session.execute(page):
        projection = _project_row(
            row,
            premium=premium,
            return_rate=return_rate,
            station_cost_per_execution=station_cost_per_execution,
            use_focus=use_focus,
        )
        oldest = projection["oldest_observed_at"] if projection else None
        opportunities.append(
            OpportunityOut(
                kind=kind,
                item=row.output_item_unique_name,
                item_name=name_pt or name_en,
                quality_level=row.output_quality,
                buy_location=row.location_id,
                sell_location=row.location_id,
                buy_price=(
                    projection["total_cost"] / row.produced_quantity
                    if projection and row.produced_quantity
                    else None
                ),
                sell_price=(
                    projection["gross_revenue"] / row.produced_quantity
                    if projection and row.produced_quantity
                    else None
                ),
                quantity=row.produced_quantity,
                gross_revenue=projection["gross_revenue"] if projection else None,
                sales_tax=projection["sales_tax"] if projection else None,
                sale_setup_fee=projection["sale_setup_fee"] if projection else None,
                net_revenue=projection["net_revenue"] if projection else None,
                acquisition_setup_fee=projection["acquisition_setup_fee"] if projection else None,
                total_fees=projection["total_fees"] if projection else None,
                total_cost=projection["total_cost"] if projection else None,
                profit=projection["profit"] if projection else None,
                roi=projection["roi"] if projection else None,
                acquisition_mode=projection["acquisition_mode"] if projection else None,
                sale_mode=projection["sale_mode"] if projection else None,
                ingredients=row.ingredients,
                station_cost=projection["station_cost"] if projection else None,
                focus_consumed=projection["focus_consumed"] if projection else None,
                oldest_observed_at=oldest.isoformat() if oldest else None,
                warnings=list(row.warnings),
                price_model="neutral_ranking",
            )
        )

    coverage = await ranking_coverage(session, server)
    return opportunities, total, coverage


async def ranking_coverage(session: AsyncSession, server: str) -> RankingCoverage:
    run = await session.scalar(select(RecipeRankingRun).where(RecipeRankingRun.server_id == server))
    if run is None:
        return RankingCoverage(
            evaluated_recipes=0,
            priced_recipes=0,
            total_recipes=int(await session.scalar(select(func.count()).select_from(Recipe)) or 0),
            computed_at=None,
            stale=True,
        )
    computed_at = run.computed_at
    if computed_at.tzinfo is None:
        computed_at = computed_at.replace(tzinfo=timezone.utc)
    return RankingCoverage(
        evaluated_recipes=run.evaluated_recipes,
        priced_recipes=run.priced_recipes,
        total_recipes=run.total_recipes,
        computed_at=computed_at.isoformat(),
        stale=(datetime.now(timezone.utc) - computed_at) > RANKING_STALENESS_LIMIT,
    )
