"""B02: the production ranking covers every eligible recipe, is served by indexed read, and
never hides truncation. The old path capped candidates at the first 200 recipes alphabetically.
"""

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import event, select, text

from src.cache.redis_client import get_redis
from src.craft.schemas import CraftSimulationRequest
from src.craft.service import simulate_craft
from src.database import engine
from src.items.models import Item, Location
from src.opportunities.models import RecipeRanking, RecipeRankingRun
from src.opportunities.ranking_service import rebuild_ranking
from src.prices.constants import AlbionServer
from src.prices.models import MarketOrder
from src.recipes.models import Recipe, RecipeIngredient
from tests.conftest import registrar_e_logar

_ZERO = Decimal("0")


def _order(item_id: str, auction_type: str, price: int, amount: int, *, location_id="1002"):
    return MarketOrder(
        server_id="west",
        source_id=uuid.uuid4().int % 1_000_000_000,
        item_id=item_id,
        group_type_id="",
        location_id=location_id,
        quality_level=1,
        enchantment_level=0,
        unit_price_silver=Decimal(price),
        amount=amount,
        auction_type=auction_type,
        expires=datetime.now(timezone.utc) + timedelta(days=1),
    )


async def _flush_cache():
    keys = [k async for k in get_redis().scan_iter(match="opportunities:v2:*")]
    if keys:
        await get_redis().delete(*keys)


async def _seed_recipe(
    db_session,
    output: str,
    ingredient: str,
    *,
    refining=True,
    ingredient_market=True,
    output_market=True,
):
    db_session.add_all(
        [
            Item(
                unique_name=output,
                albion_id=uuid.uuid4().int % 1_000_000_000,
                name_pt=output,
                tier=4,
                shop_category="resources" if refining else "weapon",
            ),
            Item(
                unique_name=ingredient,
                albion_id=uuid.uuid4().int % 1_000_000_000,
                name_pt=ingredient,
                tier=3,
                shop_category="resources",
            ),
        ]
    )
    recipe = Recipe(
        output_item_unique_name=output, output_item_id=1, silver_cost=0, amount_crafted=1
    )
    recipe.ingredients.append(
        RecipeIngredient(
            ingredient_unique_name=ingredient, ingredient_item_id=2, count=2, position=0
        )
    )
    db_session.add(recipe)
    orders = []
    if output_market:
        orders += [_order(output, "request", 500, 50), _order(output, "offer", 520, 50)]
    if ingredient_market:
        orders.append(_order(ingredient, "offer", 100, 200))
    if orders:
        db_session.add_all(orders)


async def _city(db_session):
    db_session.add(Location(location_id="1002", name="Lymhurst", kind="city", is_royal_city=True))


async def test_ranking_covers_recipes_beyond_the_first_200_alphabetically(client, db_session):
    _, token = await registrar_e_logar(client)
    await _city(db_session)
    prefix = uuid.uuid4().hex[:6]
    # 205 refining recipes, all with market data. The old path ordered by name and cut at 200.
    for index in range(205):
        await _seed_recipe(
            db_session,
            f"RANK_{prefix}_{index:03}",
            f"ING_{prefix}_{index:03}",
        )
    await db_session.commit()

    run = await rebuild_ranking(db_session, "west")
    assert run.evaluated_recipes == 205

    # The 205th recipe alphabetically — excluded by the old .limit(200) — is now ranked.
    last = f"RANK_{prefix}_204"
    present = await db_session.scalar(
        select(RecipeRanking.output_item_unique_name).where(
            RecipeRanking.output_item_unique_name == last
        )
    )
    assert present == last

    await _flush_cache()
    body = (
        await client.get(
            "/opportunities/refining",
            params={"server": "west", "limit": 200},
            headers={"Authorization": f"Bearer {token}"},
        )
    ).json()
    assert body["total"] == 205
    assert body["coverage"]["evaluated_recipes"] == 205
    assert body["coverage"]["total_recipes"] == 205
    assert body["coverage"]["stale"] is False


async def test_evaluated_count_matches_eligible_recipes(client, db_session):
    await _city(db_session)
    prefix = uuid.uuid4().hex[:6]
    await _seed_recipe(db_session, f"ELIG_{prefix}_A", f"INGA_{prefix}")
    await _seed_recipe(db_session, f"ELIG_{prefix}_B", f"INGB_{prefix}")
    # A recipe with NO market data on its output is not eligible and not counted as evaluated.
    await _seed_recipe(db_session, f"NOMARKET_{prefix}", f"INGC_{prefix}", output_market=False)
    await db_session.commit()

    run = await rebuild_ranking(db_session, "west")
    assert run.total_recipes == 3
    assert run.evaluated_recipes == 2
    distinct_ranked = await db_session.scalar(
        select(RecipeRanking.output_item_unique_name).where(
            RecipeRanking.output_item_unique_name == f"NOMARKET_{prefix}"
        )
    )
    assert distinct_ranked is None


async def test_read_query_count_is_constant_regardless_of_ranking_size(client, db_session):
    _, token = await registrar_e_logar(client)
    await _city(db_session)
    headers = {"Authorization": f"Bearer {token}"}
    prefix = uuid.uuid4().hex[:6]
    await _seed_recipe(db_session, f"Q_{prefix}_0", f"QI_{prefix}_0")
    await db_session.commit()
    await rebuild_ranking(db_session, "west")

    async def _count() -> int:
        statements: list[str] = []

        def _rec(conn, cursor, statement, parameters, context, executemany):
            statements.append(statement)

        stale = [k async for k in get_redis().scan_iter(match="opportunities:v2:*")]
        if stale:
            await get_redis().delete(*stale)
        event.listen(engine.sync_engine, "before_cursor_execute", _rec)
        try:
            resp = await client.get(
                "/opportunities/refining", params={"server": "west", "limit": 50}, headers=headers
            )
            assert resp.status_code == 200, resp.text
        finally:
            event.remove(engine.sync_engine, "before_cursor_execute", _rec)
        return len(statements)

    small = await _count()
    for index in range(1, 60):
        await _seed_recipe(db_session, f"Q_{prefix}_{index}", f"QI_{prefix}_{index}")
    await db_session.commit()
    await rebuild_ranking(db_session, "west")
    large = await _count()

    assert large == small
    assert large <= 12


async def test_materialized_row_matches_simulate_craft_in_neutral_params(client, db_session):
    _, token = await registrar_e_logar(client)
    await _city(db_session)
    prefix = uuid.uuid4().hex[:6]
    output = f"MATCH_{prefix}"
    ingredient = f"MATCHI_{prefix}"
    await _seed_recipe(db_session, output, ingredient)
    await db_session.commit()

    await rebuild_ranking(db_session, "west")
    row = await db_session.scalar(
        select(RecipeRanking).where(RecipeRanking.output_item_unique_name == output)
    )
    assert row is not None

    simulation = await simulate_craft(
        db_session,
        CraftSimulationRequest(
            server=AlbionServer.WEST,
            output_item=output,
            location_id="1002",
            quantity=1,
            output_quality=1,
            scope="all",
            return_rate=_ZERO,
            station_cost_per_execution=_ZERO,
            use_focus=False,
            premium=True,
            sales_tax_rate=_ZERO,
            setup_fee_rate=_ZERO,
        ),
        uuid.UUID(int=0),
    )
    ii = next(
        s
        for s in simulation["scenarios"]
        if str(s["acquisition_mode"]) == "immediate" and str(s["sale_mode"]) == "immediate"
    )
    assert Decimal(str(row.neutral_profit)) == ii["profit"]
    assert Decimal(str(row.ingredient_cost_immediate)) == ii["costs"]["ingredient_cost"]
    assert Decimal(str(row.output_gross_immediate)) == ii["revenue"]["gross_revenue"]


async def test_rebuild_is_idempotent(db_session):
    await _city(db_session)
    prefix = uuid.uuid4().hex[:6]
    await _seed_recipe(db_session, f"IDEM_{prefix}_A", f"IDEMI_{prefix}_A")
    await _seed_recipe(db_session, f"IDEM_{prefix}_B", f"IDEMI_{prefix}_B")
    await db_session.commit()

    first = await rebuild_ranking(db_session, "west")
    snapshot_1 = sorted(
        (r.output_item_unique_name, str(r.neutral_profit), str(r.ingredient_cost_immediate))
        for r in await db_session.scalars(select(RecipeRanking))
    )
    second = await rebuild_ranking(db_session, "west")
    snapshot_2 = sorted(
        (r.output_item_unique_name, str(r.neutral_profit), str(r.ingredient_cost_immediate))
        for r in await db_session.scalars(select(RecipeRanking))
    )
    assert snapshot_1 == snapshot_2
    assert first.ranking_rows == second.ranking_rows


async def test_stale_ranking_is_flagged_not_hidden(client, db_session):
    _, token = await registrar_e_logar(client)
    headers = {"Authorization": f"Bearer {token}"}

    # No rebuild yet: coverage says stale, zero evaluated.
    fresh = (
        await client.get("/opportunities/refining", params={"server": "west"}, headers=headers)
    ).json()
    assert fresh["coverage"]["stale"] is True
    assert fresh["coverage"]["evaluated_recipes"] == 0

    await _city(db_session)
    prefix = uuid.uuid4().hex[:6]
    await _seed_recipe(db_session, f"STALE_{prefix}", f"STALEI_{prefix}")
    await db_session.commit()
    await rebuild_ranking(db_session, "west")
    await _flush_cache()

    recent = (
        await client.get("/opportunities/refining", params={"server": "west"}, headers=headers)
    ).json()
    assert recent["coverage"]["stale"] is False

    await db_session.execute(
        text(
            "UPDATE recipe_ranking_run SET computed_at = now() - interval '30 minutes' "
            "WHERE server_id = 'west'"
        )
    )
    await db_session.commit()
    await _flush_cache()

    aged = (
        await client.get("/opportunities/refining", params={"server": "west"}, headers=headers)
    ).json()
    assert aged["coverage"]["stale"] is True
    assert len(aged["opportunities"]) >= 1  # still served, just flagged


async def test_ranking_run_row_is_upserted_per_realm(db_session):
    await _city(db_session)
    prefix = uuid.uuid4().hex[:6]
    await _seed_recipe(db_session, f"UP_{prefix}", f"UPI_{prefix}")
    await db_session.commit()

    await rebuild_ranking(db_session, "west")
    await rebuild_ranking(db_session, "west")
    runs = list(
        await db_session.scalars(
            select(RecipeRankingRun).where(RecipeRankingRun.server_id == "west")
        )
    )
    assert len(runs) == 1
