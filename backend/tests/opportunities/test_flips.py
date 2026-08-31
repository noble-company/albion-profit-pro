import time
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import event, insert, select

from src.cache.redis_client import get_redis
from src.database import engine
from src.items.models import Item, Location
from src.prices.models import MarketOrder
from src.recipes.models import Recipe, RecipeIngredient
from tests.conftest import registrar_e_logar


def _item_id() -> str:
    return f"T15_TESTITEM_{uuid.uuid4().hex[:10]}"


def _order(
    item_id: str,
    location_id: str,
    auction_type: str,
    price: int,
    amount: int,
    *,
    quality_level: int = 1,
    enchantment_level: int = 0,
    expires_in: timedelta = timedelta(days=1),
):
    return MarketOrder(
        server_id="west",
        source_id=uuid.uuid4().int % 1_000_000_000,
        item_id=item_id,
        group_type_id="",
        location_id=location_id,
        quality_level=quality_level,
        enchantment_level=enchantment_level,
        unit_price_silver=price,
        amount=amount,
        auction_type=auction_type,
        expires=datetime.now(timezone.utc) + expires_in,
    )


async def test_flips_ranks_by_profit_and_applies_quantity_and_fees(client, db_session):
    _, token = await registrar_e_logar(client)
    item_id = _item_id()
    db_session.add(Item(unique_name=item_id, albion_id=uuid.uuid4().int % 1_000_000_000))
    db_session.add_all(
        [
            _order(item_id, "1002", "offer", 100, 10),
            _order(item_id, "3005", "request", 200, 3),
        ]
    )
    await db_session.commit()

    response = await client.get(
        "/opportunities/flips",
        params={"server": "west", "location_id": ["1002", "3005"]},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total"] == 1
    opportunity = body["opportunities"][0]
    assert opportunity["buy_location"] == "1002"
    assert opportunity["sell_location"] == "3005"
    assert opportunity["quantity"] == 3
    assert opportunity["quality_level"] == 1
    assert Decimal(opportunity["total_cost"]) == Decimal("300")
    assert Decimal(opportunity["gross_revenue"]) == Decimal("576")
    assert Decimal(opportunity["profit"]) == Decimal("276")


async def test_flip_rates_follow_premium_and_order_flags(client, db_session):
    _, token = await registrar_e_logar(client)
    item_id = _item_id()
    db_session.add(Item(unique_name=item_id, albion_id=uuid.uuid4().int % 1_000_000_000))
    db_session.add_all(
        [
            _order(item_id, "1002", "offer", 100, 10),
            _order(item_id, "3005", "request", 200, 10),
        ]
    )
    await db_session.commit()

    response = await client.get(
        "/opportunities/flips",
        params={
            "server": "west",
            "premium": "false",
            "buy_order": "true",
            "sell_order": "true",
        },
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200, response.text
    opportunity = response.json()["opportunities"][0]
    assert Decimal(opportunity["total_cost"]) == Decimal("1025")
    assert Decimal(opportunity["gross_revenue"]) == Decimal("1790")
    assert Decimal(opportunity["profit"]) == Decimal("765")


async def test_flips_isolate_server_and_support_minimum_filters(client, db_session):
    _, token = await registrar_e_logar(client)
    item_id = _item_id()
    db_session.add(Item(unique_name=item_id, albion_id=uuid.uuid4().int % 1_000_000_000))
    db_session.add_all(
        [
            _order(item_id, "1002", "offer", 100, 10),
            _order(item_id, "3005", "request", 200, 10),
        ]
    )
    foreign = _order(item_id, "3005", "request", 10_000, 10)
    foreign.server_id = "east"
    db_session.add(foreign)
    await db_session.commit()
    headers = {"Authorization": f"Bearer {token}"}

    response = await client.get(
        "/opportunities/flips",
        params={"server": "west", "min_profit": "80"},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    assert response.json()["total"] == 1

    empty = await client.get(
        "/opportunities/flips",
        params={"server": "east"},
        headers=headers,
    )
    assert empty.status_code == 200, empty.text
    assert empty.json()["opportunities"] == []


async def test_flip_filters_quality_and_writes_short_cache(client, db_session):
    _, token = await registrar_e_logar(client)
    item_id = _item_id()
    db_session.add(Item(unique_name=item_id, albion_id=uuid.uuid4().int % 1_000_000_000))
    db_session.add_all(
        [
            _order(item_id, "1002", "offer", 100, 10),
            _order(item_id, "3005", "request", 200, 10),
        ]
    )
    await db_session.commit()
    headers = {"Authorization": f"Bearer {token}"}

    response = await client.get(
        "/opportunities/flips",
        params={"server": "west", "quality_level": 2},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    assert response.json()["opportunities"] == []

    response = await client.get(
        "/opportunities/flips",
        params={"server": "west", "max_age_hours": 1},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    keys = [key async for key in get_redis().scan_iter(match="opportunities:v2:*")]
    assert keys


async def test_recipe_rankings_have_stable_paginated_contract_when_catalog_is_empty(client):
    _, token = await registrar_e_logar(client)
    headers = {"Authorization": f"Bearer {token}"}

    for endpoint, kind in (("refining", "refining"), ("crafting", "crafting")):
        response = await client.get(
            f"/opportunities/{endpoint}",
            params={"server": "west", "limit": 10},
            headers=headers,
        )
        assert response.status_code == 200, response.text
        assert response.json() == {
            "server": "west",
            "kind": kind,
            "opportunities": [],
            "total": 0,
            "limit": 10,
            "offset": 0,
        }


async def test_refining_ranking_filters_kind_before_cap_and_uses_craft_engine(client, db_session):
    _, token = await registrar_e_logar(client)
    output_id = _item_id()
    ingredient_id = _item_id()
    # Regression: the production query used to cap the entire alphabetical catalog at
    # 200 rows and only then classify recipes. Real refining recipes start around row
    # 3,000, so no refining candidate was ever evaluated.
    irrelevant_items = []
    irrelevant_recipes = []
    noise_prefix = uuid.uuid4().hex[:8]
    for position in range(201):
        noise_id = f"A_NOISE_{noise_prefix}_{position:03}"
        irrelevant_items.append(
            Item(
                unique_name=noise_id,
                albion_id=uuid.uuid4().int % 1_000_000_000,
                shop_category="other",
                shop_subcategory="questitems",
            )
        )
        irrelevant_recipes.append(
            Recipe(
                output_item_unique_name=noise_id,
                output_item_id=uuid.uuid4().int % 1_000_000_000,
                amount_crafted=1,
            )
        )
    db_session.add_all(
        [
            *irrelevant_items,
            *irrelevant_recipes,
            Item(
                unique_name=output_id,
                albion_id=uuid.uuid4().int % 1_000_000_000,
                name_pt="Tecido de teste",
                tier=4,
                shop_category="resources",
            ),
            Item(
                unique_name=ingredient_id,
                albion_id=uuid.uuid4().int % 1_000_000_000,
                name_pt="Fibra de teste",
                tier=3,
                shop_category="resources",
            ),
            Location(location_id="1002", name="Lymhurst", kind="city", is_royal_city=True),
        ]
    )
    recipe = Recipe(
        output_item_unique_name=output_id,
        output_item_id=1,
        silver_cost=0,
        amount_crafted=1,
    )
    recipe.ingredients.append(
        RecipeIngredient(
            ingredient_unique_name=ingredient_id,
            ingredient_item_id=2,
            count=1,
            position=0,
        )
    )
    db_session.add(recipe)
    db_session.add_all(
        [
            _order(ingredient_id, "1002", "offer", 100, 10),
            _order(output_id, "1002", "request", 300, 10),
            _order(output_id, "1002", "offer", 350, 10),
            MarketOrder(
                server_id="west",
                source_id=uuid.uuid4().int % 1_000_000_000,
                item_id=output_id,
                group_type_id="",
                location_id="1002",
                quality_level=2,
                enchantment_level=0,
                unit_price_silver=400,
                amount=10,
                auction_type="request",
                expires=datetime.now(timezone.utc) + timedelta(days=1),
            ),
        ]
    )
    await db_session.commit()

    response = await client.get(
        "/opportunities/refining",
        params={"server": "west", "location_id": "1002"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total"] == 2
    assert {row["quality_level"] for row in body["opportunities"]} == {1, 2}
    normal = next(row for row in body["opportunities"] if row["quality_level"] == 1)
    assert normal["item"] == output_id
    assert normal["acquisition_mode"] in {"immediate", "buy_order"}
    assert normal["sale_mode"] in {"immediate", "sell_order"}
    assert normal["ingredients"] == [
        {
            "item": ingredient_id,
            "item_name": "Fibra de teste",
            "gross_quantity": 1,
            "expected_return_quantity": "0",
            "purchase_quantity": 1,
        }
    ]
    assert normal["station_cost"] == "0"
    assert normal["focus_consumed"] == 0
    assert Decimal(normal["profit"]) > 0

    quality_filtered = await client.get(
        "/opportunities/refining",
        params={"server": "west", "location_id": "1002", "quality_level": 2},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert quality_filtered.status_code == 200, quality_filtered.text
    assert quality_filtered.json()["total"] == 1
    assert quality_filtered.json()["opportunities"][0]["quality_level"] == 2

    configured = await client.get(
        "/opportunities/refining",
        params={
            "server": "west",
            "location_id": "1002",
            "station_cost_per_execution": "10",
            "return_rate": "0.5",
            "use_focus": "true",
            "premium": "false",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert configured.status_code == 200, configured.text
    assert configured.json()["total"] == 2
    assert Decimal(configured.json()["opportunities"][0]["profit"]) < Decimal(
        body["opportunities"][0]["profit"]
    )

    stale_at = datetime.now(timezone.utc) - timedelta(hours=8)
    for order in await db_session.scalars(
        select(MarketOrder).where(MarketOrder.item_id.in_([output_id, ingredient_id]))
    ):
        order.last_seen_at = stale_at
    await db_session.commit()

    stale_for_six_hours = await client.get(
        "/opportunities/refining",
        params={"server": "west", "location_id": "1002", "max_age_hours": 6},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert stale_for_six_hours.status_code == 200, stale_for_six_hours.text
    assert stale_for_six_hours.json()["total"] == 0

    accepted_for_twenty_four_hours = await client.get(
        "/opportunities/refining",
        params={"server": "west", "location_id": "1002", "max_age_hours": 24},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert accepted_for_twenty_four_hours.status_code == 200, accepted_for_twenty_four_hours.text
    assert accepted_for_twenty_four_hours.json()["total"] == 2


async def test_recipe_ranking_rejects_invalid_return_rate(client):
    _, token = await registrar_e_logar(client)
    response = await client.get(
        "/opportunities/crafting",
        params={"server": "west", "return_rate": "1.1"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 422


async def test_flip_ignores_expired_orders_on_both_sides(client, db_session):
    _, token = await registrar_e_logar(client)
    headers = {"Authorization": f"Bearer {token}"}
    item_id = _item_id()
    db_session.add(Item(unique_name=item_id, albion_id=uuid.uuid4().int % 1_000_000_000))
    db_session.add_all(
        [
            _order(item_id, "1002", "offer", 100, 10),
            _order(item_id, "3005", "request", 200, 10),
            # An expired offer that is cheaper must never be quoted (B03).
            _order(item_id, "1002", "offer", 10, 10, expires_in=timedelta(hours=-1)),
            # An expired request that pays more must never be quoted either.
            _order(item_id, "3005", "request", 9_999, 10, expires_in=timedelta(hours=-1)),
        ]
    )
    await db_session.commit()

    body = (
        await client.get(
            "/opportunities/flips",
            params={"server": "west", "location_id": ["1002", "3005"]},
            headers=headers,
        )
    ).json()

    assert body["total"] == 1
    opportunity = body["opportunities"][0]
    assert Decimal(opportunity["buy_price"]) == Decimal("100")
    assert Decimal(opportunity["sell_price"]) == Decimal("200")
    assert opportunity["price_model"] == "top_of_book"

    db_session.add_all(
        [
            _order(item_id, "1002", "offer", 100, 10, expires_in=timedelta(hours=-1)),
            _order(item_id, "3005", "request", 200, 10, expires_in=timedelta(hours=-1)),
        ]
    )
    await db_session.commit()
    still_one = (
        await client.get(
            "/opportunities/flips",
            params={"server": "west", "location_id": ["1002", "3005"]},
            headers=headers,
        )
    ).json()
    assert still_one["total"] == 1


async def test_flip_pagination_keeps_total_stable_to_the_last_page(client, db_session):
    _, token = await registrar_e_logar(client)
    headers = {"Authorization": f"Bearer {token}"}
    for index in range(5):
        item_id = _item_id()
        db_session.add(Item(unique_name=item_id, albion_id=uuid.uuid4().int % 1_000_000_000))
        db_session.add_all(
            [
                _order(item_id, "1002", "offer", 100, 10),
                _order(item_id, "3005", "request", 200 + index * 10, 10),
            ]
        )
    await db_session.commit()

    seen: list[str] = []
    for offset in (0, 2, 4):
        page = (
            await client.get(
                "/opportunities/flips",
                params={"server": "west", "limit": 2, "offset": offset},
                headers=headers,
            )
        ).json()
        assert page["total"] == 5
        seen.extend(row["item"] for row in page["opportunities"])
    assert len(seen) == 5
    assert len(set(seen)) == 5


async def test_flip_quantity_never_exceeds_buyer_depth_and_stays_within_one_side(
    client, db_session
):
    _, token = await registrar_e_logar(client)
    headers = {"Authorization": f"Bearer {token}"}
    item_id = _item_id()
    other_item = _item_id()
    db_session.add_all(
        [
            Item(unique_name=item_id, albion_id=uuid.uuid4().int % 1_000_000_000),
            Item(unique_name=other_item, albion_id=uuid.uuid4().int % 1_000_000_000),
        ]
    )
    db_session.add_all(
        [
            # Best offer holds 4 units; deeper, pricier offers do not raise the executable qty.
            _order(item_id, "1002", "offer", 100, 4),
            _order(item_id, "1002", "offer", 120, 50),
            _order(item_id, "3005", "request", 300, 40),
            # Noise that must not cross item or enchantment boundaries.
            _order(other_item, "3005", "request", 9_999, 10),
            _order(item_id, "3005", "request", 9_999, 10, enchantment_level=2),
        ]
    )
    await db_session.commit()

    body = (
        await client.get(
            "/opportunities/flips",
            params={"server": "west"},
            headers=headers,
        )
    ).json()

    assert body["total"] == 1
    opportunity = body["opportunities"][0]
    assert opportunity["item"] == item_id
    assert opportunity["quantity"] == 4
    assert Decimal(opportunity["buy_price"]) == Decimal("100")
    assert Decimal(opportunity["sell_price"]) == Decimal("300")


def _count_statements():
    statements: list[str] = []

    def _record(conn, cursor, statement, parameters, context, executemany):
        statements.append(statement)

    event.listen(engine.sync_engine, "before_cursor_execute", _record)
    return statements, lambda: event.remove(engine.sync_engine, "before_cursor_execute", _record)


async def test_flip_query_count_is_constant_regardless_of_dataset_size(client, db_session):
    _, token = await registrar_e_logar(client)
    headers = {"Authorization": f"Bearer {token}"}

    async def _measure() -> tuple[int, float]:
        redis = get_redis()
        stale = [key async for key in redis.scan_iter(match="opportunities:v2:*")]
        if stale:
            await redis.delete(*stale)
        statements, stop = _count_statements()
        try:
            started = time.perf_counter()
            response = await client.get(
                "/opportunities/flips", params={"server": "west", "limit": 50}, headers=headers
            )
            elapsed = time.perf_counter() - started
        finally:
            stop()
        assert response.status_code == 200, response.text
        return len(statements), elapsed

    small_count, _ = await _measure()

    rows: list[dict] = []
    orders: list[dict] = []
    now = datetime.now(timezone.utc)
    run = uuid.uuid4().hex[:6]
    albion_base = uuid.uuid4().int % 1_000_000
    source_base = uuid.uuid4().int % 1_000_000
    for index in range(2500):
        item_id = f"T15_LOAD_{index:05}_{run}"
        rows.append({"unique_name": item_id, "albion_id": albion_base * 10_000 + index})
        for side, (city, kind, price) in enumerate(
            (("1002", "offer", 100), ("3005", "request", 250))
        ):
            orders.append(
                {
                    "server_id": "west",
                    "source_id": (source_base * 10_000 + index) * 2 + side,
                    "item_id": item_id,
                    "group_type_id": "",
                    "location_id": city,
                    "quality_level": 1,
                    "enchantment_level": 0,
                    "unit_price_silver": price,
                    "amount": 10,
                    "auction_type": kind,
                    "expires": now + timedelta(days=1),
                }
            )
    await db_session.execute(insert(Item), rows)
    await db_session.execute(insert(MarketOrder), orders)
    await db_session.commit()

    large_count, large_elapsed = await _measure()

    assert large_count == small_count
    assert large_count <= 12
    # 2,500+ combinations still resolve well under a generous budget because the work is in SQL.
    assert large_elapsed < 5.0
