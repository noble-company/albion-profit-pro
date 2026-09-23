import time
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import event, insert

from src.cache.redis_client import get_redis
from src.database import engine
from src.items.models import Item
from src.prices.models import MarketOrder
from tests.conftest import registrar_e_logar


async def _flush_opportunity_cache():
    keys = [key async for key in get_redis().scan_iter(match="opportunities:v2:*")]
    if keys:
        await get_redis().delete(*keys)


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
        params={
            "server": "west",
            "buy_location_id": ["1002"],
            "sell_location_id": ["3005"],
        },
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
    assert Decimal(opportunity["gross_revenue"]) == Decimal("600")  # actual gross (B04)
    assert Decimal(opportunity["sales_tax"]) == Decimal("24")  # ceil(600 * 0.04)
    assert Decimal(opportunity["sale_setup_fee"]) == Decimal("0")
    assert Decimal(opportunity["net_revenue"]) == Decimal("576")
    assert Decimal(opportunity["total_fees"]) == Decimal("24")
    assert Decimal(opportunity["profit"]) == Decimal("276")
    assert Decimal(opportunity["gross_revenue"]) - Decimal(opportunity["sales_tax"]) - Decimal(
        opportunity["sale_setup_fee"]
    ) == Decimal(opportunity["net_revenue"])


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
    assert Decimal(opportunity["gross_revenue"]) == Decimal("2000")
    assert Decimal(opportunity["sales_tax"]) == Decimal("160")  # ceil(2000 * 0.08), no premium
    assert Decimal(opportunity["sale_setup_fee"]) == Decimal("50")  # sell_order: ceil(2000*0.025)
    assert Decimal(opportunity["acquisition_setup_fee"]) == Decimal(
        "25"
    )  # buy_order: ceil(1000*0.025)
    assert Decimal(opportunity["net_revenue"]) == Decimal("1790")
    assert Decimal(opportunity["total_fees"]) == Decimal("235")
    assert Decimal(opportunity["total_cost"]) == Decimal("1025")
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
            params={
                "server": "west",
                "buy_location_id": ["1002"],
                "sell_location_id": ["3005"],
            },
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
            params={
                "server": "west",
                "buy_location_id": ["1002"],
                "sell_location_id": ["3005"],
            },
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


async def test_flip_filters_buy_and_sell_cities_independently(client, db_session):
    _, token = await registrar_e_logar(client)
    headers = {"Authorization": f"Bearer {token}"}
    item_id = _item_id()
    db_session.add(Item(unique_name=item_id, albion_id=uuid.uuid4().int % 1_000_000_000, tier=4))
    db_session.add_all(
        [
            _order(item_id, "1002", "offer", 100, 10),
            _order(item_id, "3005", "offer", 110, 10),
            _order(item_id, "4002", "offer", 120, 10),
            _order(item_id, "1002", "request", 200, 10),
            _order(item_id, "3005", "request", 210, 10),
            _order(item_id, "4002", "request", 220, 10),
        ]
    )
    await db_session.commit()

    buy_only = await client.get(
        "/opportunities/flips",
        params={"server": "west", "buy_location_id": ["1002"]},
        headers=headers,
    )
    assert buy_only.status_code == 200, buy_only.text
    assert {row["buy_location"] for row in buy_only.json()["opportunities"]} == {"1002"}
    assert {row["sell_location"] for row in buy_only.json()["opportunities"]} == {
        "3005",
        "4002",
    }

    sell_only = await client.get(
        "/opportunities/flips",
        params={"server": "west", "sell_location_id": ["3005"]},
        headers=headers,
    )
    assert sell_only.status_code == 200, sell_only.text
    assert {row["buy_location"] for row in sell_only.json()["opportunities"]} == {
        "1002",
        "4002",
    }
    assert {row["sell_location"] for row in sell_only.json()["opportunities"]} == {"3005"}


async def test_flip_combines_city_lists_without_same_city_routes(client, db_session):
    _, token = await registrar_e_logar(client)
    headers = {"Authorization": f"Bearer {token}"}
    item_id = _item_id()
    db_session.add(Item(unique_name=item_id, albion_id=uuid.uuid4().int % 1_000_000_000, tier=4))
    for city, offer, request in (
        ("1002", 100, 200),
        ("3005", 110, 210),
        ("4002", 120, 220),
    ):
        db_session.add_all(
            [
                _order(item_id, city, "offer", offer, 10),
                _order(item_id, city, "request", request, 10),
            ]
        )
    await db_session.commit()

    response = await client.get(
        "/opportunities/flips",
        params={
            "server": "west",
            "buy_location_id": ["1002", "3005"],
            "sell_location_id": ["3005", "4002"],
        },
        headers=headers,
    )
    assert response.status_code == 200, response.text
    routes = {
        (row["buy_location"], row["sell_location"]) for row in response.json()["opportunities"]
    }
    assert routes == {("1002", "3005"), ("1002", "4002"), ("3005", "4002")}


async def test_flip_accepts_multiple_item_dimensions_and_single_values(client, db_session):
    _, token = await registrar_e_logar(client)
    headers = {"Authorization": f"Bearer {token}"}
    specs = [(4, 0, 1), (5, 1, 2), (6, 2, 3)]
    item_ids: dict[int, str] = {}
    for tier, enchantment, quality in specs:
        item_id = _item_id()
        item_ids[tier] = item_id
        db_session.add(
            Item(
                unique_name=item_id,
                albion_id=uuid.uuid4().int % 1_000_000_000,
                tier=tier,
                enchantment_level=enchantment,
            )
        )
        db_session.add_all(
            [
                _order(
                    item_id,
                    "1002",
                    "offer",
                    100,
                    10,
                    quality_level=quality,
                    enchantment_level=enchantment,
                ),
                _order(
                    item_id,
                    "3005",
                    "request",
                    200,
                    10,
                    quality_level=quality,
                    enchantment_level=enchantment,
                ),
            ]
        )
    await db_session.commit()

    multiple = await client.get(
        "/opportunities/flips",
        params={
            "server": "west",
            "tier": [4, 5],
            "enchantment_level": [0, 1],
            "quality_level": [1, 2],
        },
        headers=headers,
    )
    assert multiple.status_code == 200, multiple.text
    assert {row["item"] for row in multiple.json()["opportunities"]} == {
        item_ids[4],
        item_ids[5],
    }

    single = await client.get(
        "/opportunities/flips",
        params={"server": "west", "tier": 4},
        headers=headers,
    )
    assert single.status_code == 200, single.text
    assert {row["item"] for row in single.json()["opportunities"]} == {item_ids[4]}


async def test_flip_rejects_item_dimension_values_outside_their_ranges(client):
    _, token = await registrar_e_logar(client)
    headers = {"Authorization": f"Bearer {token}"}
    for params in (
        {"tier": 9},
        {"tier": 0},
        {"enchantment_level": 5},
        {"enchantment_level": -1},
        {"quality_level": 6},
        {"quality_level": 0},
    ):
        response = await client.get(
            "/opportunities/flips",
            params={"server": "west", **params},
            headers=headers,
        )
        assert response.status_code == 422, (params, response.text)


async def test_flip_cache_normalizes_repeated_filter_order(client, db_session):
    _, token = await registrar_e_logar(client)
    headers = {"Authorization": f"Bearer {token}"}

    first = await client.get(
        "/opportunities/flips",
        params={
            "server": "west",
            "tier": [5, 4, 5],
            "buy_location_id": ["3005", "1002", "3005"],
        },
        headers=headers,
    )
    second = await client.get(
        "/opportunities/flips",
        params={
            "server": "west",
            "buy_location_id": ["1002", "3005"],
            "tier": [4, 5, 4],
        },
        headers=headers,
    )
    assert first.status_code == second.status_code == 200
    keys = [key async for key in get_redis().scan_iter(match="opportunities:v2:flip:*")]
    assert len(keys) == 1


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
                "/opportunities/flips",
                params={
                    "server": "west",
                    "limit": 50,
                    "buy_location_id": ["1002"],
                    "sell_location_id": ["3005"],
                    "tier": [4, 5],
                },
                headers=headers,
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
        rows.append({"unique_name": item_id, "albion_id": albion_base * 10_000 + index, "tier": 4})
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


async def test_flip_sort_is_global_not_a_reorder_of_the_profit_page(client, db_session):
    """F08: ordenar por ROI e paginar dá sequência globalmente decrescente entre páginas.

    Os 6 itens são construídos com lucro crescente e ROI decrescente — as pontas do ranking
    de lucro e do ranking de ROI se invertem. Antes desta task o servidor ignorava ``sort`` e
    devolvia sempre a ordem de lucro; percorrer as páginas com ``sort=roi`` não dava sequência
    monotônica.
    """
    _, token = await registrar_e_logar(client)
    headers = {"Authorization": f"Bearer {token}"}
    specs = [(10, 30), (40, 85), (160, 260), (640, 860), (2560, 3060), (10240, 11340)]
    for buy, sell in specs:
        item_id = _item_id()
        db_session.add(Item(unique_name=item_id, albion_id=uuid.uuid4().int % 1_000_000_000))
        db_session.add_all(
            [
                _order(item_id, "1002", "offer", buy, 100),
                _order(item_id, "3005", "request", sell, 100),
            ]
        )
    await db_session.commit()

    async def _walk(sort: str, direction: str) -> list[dict]:
        rows: list[dict] = []
        for offset in (0, 2, 4):
            page = (
                await client.get(
                    "/opportunities/flips",
                    params={
                        "server": "west",
                        "limit": 2,
                        "offset": offset,
                        "sort": sort,
                        "direction": direction,
                    },
                    headers=headers,
                )
            ).json()
            assert page["total"] == 6
            rows.extend(page["opportunities"])
        return rows

    by_roi = await _walk("roi", "desc")
    roi_values = [Decimal(row["roi"]) for row in by_roi]
    assert roi_values == sorted(roi_values, reverse=True)
    assert len({row["item"] for row in by_roi}) == 6  # nenhuma linha repetida ou omitida

    by_profit = await _walk("profit", "desc")
    profit_values = [Decimal(row["profit"]) for row in by_profit]
    assert profit_values == sorted(profit_values, reverse=True)
    # É outro ranking: a 1ª linha por ROI é a última por lucro.
    assert by_roi[0]["item"] == by_profit[-1]["item"]

    ascending = await _walk("roi", "asc")
    assert [Decimal(row["roi"]) for row in ascending] == sorted(
        Decimal(row["roi"]) for row in ascending
    )


async def test_flip_rejects_invalid_sort_before_it_reaches_sql(client):
    _, token = await registrar_e_logar(client)
    headers = {"Authorization": f"Bearer {token}"}
    for bad in ("'; DROP TABLE market_order; --", "profit; --", "gross", "PROFIT"):
        response = await client.get(
            "/opportunities/flips",
            params={"server": "west", "sort": bad},
            headers=headers,
        )
        assert response.status_code == 422, (bad, response.text)

    bad_direction = await client.get(
        "/opportunities/flips",
        params={"server": "west", "direction": "sideways"},
        headers=headers,
    )
    assert bad_direction.status_code == 422


async def test_flip_pagination_is_stable_when_profit_ties(client, db_session):
    """Desempate estável (F08, item 6): lucros idênticos não fazem a paginação repetir/pular."""
    _, token = await registrar_e_logar(client)
    headers = {"Authorization": f"Bearer {token}"}
    for _ in range(6):
        item_id = _item_id()
        db_session.add(Item(unique_name=item_id, albion_id=uuid.uuid4().int % 1_000_000_000))
        db_session.add_all(
            [
                _order(item_id, "1002", "offer", 100, 10),
                _order(item_id, "3005", "request", 200, 10),
            ]
        )
    await db_session.commit()

    seen: list[str] = []
    for offset in (0, 3):
        page = (
            await client.get(
                "/opportunities/flips",
                params={"server": "west", "limit": 3, "offset": offset},
                headers=headers,
            )
        ).json()
        assert page["total"] == 6
        seen.extend(row["item"] for row in page["opportunities"])
    assert len(seen) == 6
    assert len(set(seen)) == 6
