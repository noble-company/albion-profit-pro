"""B07/B08: game tax rates and the freshness window have one definition, and every surface
(flip, recipe ranking, ``/craft/simulate``) reads it. Changing the constant must move them all.
"""

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from src.craft import constants
from src.items.models import Item, Location
from src.opportunities.ranking_service import rebuild_ranking
from src.prices.models import MarketOrder
from src.prices.policy import MarketBookPolicy
from src.recipes.models import Recipe, RecipeIngredient
from tests.conftest import registrar_e_logar


def _iid() -> str:
    return f"T4_SOT_{uuid.uuid4().hex[:10]}"


def _order(item_id, location_id, auction_type, price, amount, *, seen=None):
    return MarketOrder(
        server_id="west",
        source_id=uuid.uuid4().int % 1_000_000_000,
        item_id=item_id,
        group_type_id="",
        location_id=location_id,
        quality_level=1,
        enchantment_level=0,
        unit_price_silver=Decimal(str(price)),
        amount=amount,
        auction_type=auction_type,
        expires=datetime.now(timezone.utc) + timedelta(days=1),
        last_seen_at=seen or datetime.now(timezone.utc),
    )


async def _seed(db_session, *, seen=None):
    output = _iid()
    ingredient = _iid()
    db_session.add_all(
        [
            Item(
                unique_name=output,
                albion_id=uuid.uuid4().int % 1_000_000_000,
                name_pt="Saida",
                tier=4,
                shop_category="resources",
            ),
            Item(
                unique_name=ingredient,
                albion_id=uuid.uuid4().int % 1_000_000_000,
                name_pt="Insumo",
                tier=3,
                shop_category="resources",
            ),
            Location(location_id="1002", name="Lymhurst", kind="city", is_royal_city=True),
            Location(location_id="3005", name="Martlock", kind="city", is_royal_city=True),
        ]
    )
    recipe = Recipe(
        output_item_unique_name=output,
        output_item_id=1,
        silver_cost=0,
        amount_crafted=1,
        production_kind="refining",
    )
    recipe.ingredients.append(
        RecipeIngredient(
            ingredient_unique_name=ingredient, ingredient_item_id=2, count=1, position=0
        )
    )
    db_session.add(recipe)
    db_session.add_all(
        [
            _order(ingredient, "1002", "offer", 100, 100, seen=seen),
            _order(output, "1002", "request", 5000, 100, seen=seen),
            _order(output, "1002", "offer", 5200, 100, seen=seen),
            _order(output, "3005", "offer", 1000, 100, seen=seen),
        ]
    )
    await db_session.commit()
    # The recipe ranking is materialized; refino/craft read it. Neutral rebuild — independent
    # of the tax constant under test, which the read projection applies afterwards.
    await rebuild_ranking(db_session, "west")
    return output


async def _flush_opportunity_cache():
    from src.cache.redis_client import get_redis

    redis = get_redis()
    keys = [key async for key in redis.scan_iter(match="opportunities:v2:*")]
    if keys:
        await redis.delete(*keys)


async def _profit_snapshot(client, token, output):
    headers = {"Authorization": f"Bearer {token}"}
    await _flush_opportunity_cache()
    flip = (
        await client.get("/opportunities/flips", params={"server": "west"}, headers=headers)
    ).json()
    refining = (
        await client.get(
            "/opportunities/refining",
            params={"server": "west", "location_id": "1002"},
            headers=headers,
        )
    ).json()
    simulate = (
        await client.post(
            "/craft/simulate",
            json={
                "server": "west",
                "output_item": output,
                "quantity": 1,
                "location_id": "1002",
                "premium": True,
            },
            headers=headers,
        )
    ).json()
    flip_profit = Decimal(flip["opportunities"][0]["profit"])
    refining_profit = Decimal(refining["opportunities"][0]["profit"])
    sim_profit = max(Decimal(s["profit"]) for s in simulate["scenarios"] if s["profit"] is not None)
    return flip_profit, refining_profit, sim_profit


async def test_sales_tax_rate_is_single_source_across_surfaces(client, db_session, monkeypatch):
    _, token = await registrar_e_logar(client)
    output = await _seed(db_session)

    base_flip, base_refining, base_sim = await _profit_snapshot(client, token, output)

    monkeypatch.setattr(constants, "DEFAULT_PREMIUM_SALES_TAX_RATE", Decimal("0.5"))

    hi_flip, hi_refining, hi_sim = await _profit_snapshot(client, token, output)

    assert hi_flip < base_flip
    assert hi_refining < base_refining
    assert hi_sim < base_sim


async def test_price_freshness_window_is_single_source_in_flip(client, db_session, monkeypatch):
    _, token = await registrar_e_logar(client)
    three_hours_ago = datetime.now(timezone.utc) - timedelta(hours=3)
    await _seed(db_session, seen=three_hours_ago)
    headers = {"Authorization": f"Bearer {token}"}

    await _flush_opportunity_cache()
    default_window = (
        await client.get("/opportunities/flips", params={"server": "west"}, headers=headers)
    ).json()
    assert default_window["opportunities"][0]["warnings"] == []

    monkeypatch.setattr(
        "src.opportunities.service.get_market_book_policy",
        lambda: MarketBookPolicy(freshness=timedelta(hours=1)),
    )
    await _flush_opportunity_cache()
    tight_window = (
        await client.get("/opportunities/flips", params={"server": "west"}, headers=headers)
    ).json()
    assert tight_window["opportunities"][0]["warnings"] == ["dado_velho"]
