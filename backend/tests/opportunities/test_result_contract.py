"""B04/B05: the money fields mean the same thing across the read surfaces, and
require_complete drops the same kind of row.

**Narrowed by task 4/15.** This file used to compare /flips, /refining and /crafting side by
side — the point being that three engines agreed on what "profit" means. The two ranking
endpoints were retired with the materialized table, so only /flips is left here, and the
cross-surface comparison it provided is genuinely gone.

What replaced it is not equivalent, and is worth naming: the scanner computes on the client,
so its agreement with the server is locked by the golden vectors
(`frontend/src/scanner/engine.golden.test.ts` against `tests/craft/test_scanner_vectors.py`)
rather than by asking two endpoints the same question.
"""

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select

from src.cache.redis_client import get_redis
from src.items.models import Item, Location
from src.prices.models import MarketOrder
from src.recipes.models import Recipe, RecipeIngredient
from tests.conftest import registrar_e_logar

MONEY_FIELDS = (
    "gross_revenue",
    "sales_tax",
    "sale_setup_fee",
    "net_revenue",
    "acquisition_setup_fee",
    "total_fees",
    "total_cost",
    "profit",
)


def _order(item_id, loc, side, price, amount, *, quality=1):
    return MarketOrder(
        server_id="west",
        source_id=uuid.uuid4().int % 1_000_000_000,
        item_id=item_id,
        group_type_id="",
        location_id=loc,
        quality_level=quality,
        enchantment_level=0,
        unit_price_silver=Decimal(price),
        amount=amount,
        auction_type=side,
        expires=datetime.now(timezone.utc) + timedelta(days=1),
    )


async def _flush():
    keys = [k async for k in get_redis().scan_iter(match="opportunities:v2:*")]
    if keys:
        await get_redis().delete(*keys)


async def _seed_all_kinds(db_session) -> dict:
    prefix = uuid.uuid4().hex[:6]
    flip_item = f"FLIP_{prefix}"
    refine_out = f"REF_{prefix}"
    refine_in = f"REFI_{prefix}"
    craft_out = f"CRAFT_{prefix}"
    craft_in = f"CRAFTI_{prefix}"
    db_session.add_all(
        [
            Location(location_id="1002", name="Lymhurst", kind="city", is_royal_city=True),
            Location(location_id="3005", name="Martlock", kind="city", is_royal_city=True),
            Item(unique_name=flip_item, albion_id=uuid.uuid4().int % 1_000_000_000, name_pt="Flip"),
            Item(
                unique_name=refine_out,
                albion_id=uuid.uuid4().int % 1_000_000_000,
                name_pt="Ref",
                tier=4,
                shop_category="resources",
            ),
            Item(
                unique_name=refine_in,
                albion_id=uuid.uuid4().int % 1_000_000_000,
                name_pt="RefIn",
                tier=3,
                shop_category="resources",
            ),
            Item(
                unique_name=craft_out,
                albion_id=uuid.uuid4().int % 1_000_000_000,
                name_pt="Craft",
                tier=4,
                shop_category="weapon",
            ),
            Item(
                unique_name=craft_in,
                albion_id=uuid.uuid4().int % 1_000_000_000,
                name_pt="CraftIn",
                tier=3,
                shop_category="resources",
            ),
        ]
    )
    for out_name, in_name, kind in (
        (refine_out, refine_in, "refining"),
        (craft_out, craft_in, "crafting"),
    ):
        recipe = Recipe(
            output_item_unique_name=out_name,
            output_item_id=1,
            silver_cost=0,
            amount_crafted=1,
            production_kind=kind,
        )
        recipe.ingredients.append(
            RecipeIngredient(
                ingredient_unique_name=in_name, ingredient_item_id=2, count=1, position=0
            )
        )
        db_session.add(recipe)
    db_session.add_all(
        [
            _order(flip_item, "1002", "offer", 100, 20),
            _order(flip_item, "3005", "request", 400, 20),
            _order(refine_in, "1002", "offer", 100, 50),
            _order(refine_out, "1002", "request", 3000, 50),
            _order(refine_out, "1002", "offer", 3200, 50),
            _order(craft_in, "1002", "offer", 100, 50),
            _order(craft_out, "1002", "request", 5000, 50),
            _order(craft_out, "1002", "offer", 5200, 50),
        ]
    )
    await db_session.commit()
    await _flush()
    return {"flip": flip_item, "refine": refine_out, "craft": craft_out}


async def _rows(client, token, endpoint, **params):
    resp = await client.get(
        f"/opportunities/{endpoint}",
        params={"server": "west", "premium": "true", **params},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["opportunities"]


async def test_revenue_identity_holds(client, db_session):
    endpoint = "flips"
    _, token = await registrar_e_logar(client)
    await _seed_all_kinds(db_session)

    rows = await _rows(client, token, endpoint)
    assert rows
    for row in rows:
        gross = Decimal(row["gross_revenue"])
        net = Decimal(row["net_revenue"])
        assert gross - Decimal(row["sales_tax"]) - Decimal(row["sale_setup_fee"]) == net
        assert Decimal(row["total_fees"]) == (
            Decimal(row["sales_tax"])
            + Decimal(row["sale_setup_fee"])
            + Decimal(row["acquisition_setup_fee"])
        )
        assert net - Decimal(row["total_cost"]) == Decimal(row["profit"])
        # gross is never the net value
        assert gross >= net


async def test_money_fields_are_decimal_strings_not_numbers(client, db_session):
    endpoint = "flips"
    _, token = await registrar_e_logar(client)
    await _seed_all_kinds(db_session)
    rows = await _rows(client, token, endpoint)
    assert rows
    for row in rows:
        for field in (*MONEY_FIELDS, "buy_price", "sell_price", "roi"):
            value = row[field]
            assert value is None or isinstance(value, str), f"{endpoint}.{field} = {value!r}"


async def test_require_complete_drops_stale_rows(client, db_session):
    _, token = await registrar_e_logar(client)
    kinds = await _seed_all_kinds(db_session)

    # Age every order past the 6h policy so the flip rows go stale — the "incomplete" state.
    stale_at = datetime.now(timezone.utc) - timedelta(hours=10)
    for order in await db_session.scalars(select(MarketOrder)):
        order.last_seen_at = stale_at
    await db_session.commit()
    await _flush()

    lax = await _rows(client, token, "flips")
    await _flush()
    strict = await _rows(client, token, "flips", require_complete="true")
    assert len(lax) >= 1
    assert strict == []  # every row had a warning / no fresh price

    _ = kinds
