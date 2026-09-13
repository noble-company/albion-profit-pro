import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import event

from src.craft.compare_service import compare_craft
from src.craft.schemas import CraftCompareRequest
from src.database import engine as db_engine
from src.items.models import Item, Location
from src.items.service import list_eligible_craft_locations
from src.prices.models import MarketOrder
from src.recipes.models import Recipe, RecipeIngredient


def _item(name: str, albion_id: int, enchantment: int = 0) -> Item:
    return Item(
        unique_name=name,
        albion_id=albion_id,
        name_pt=name,
        name_en=name,
        tier=4,
        enchantment_level=enchantment,
        busca_normalizada=name.casefold(),
    )


def _recipe(
    output: str,
    output_id: int,
    level: int,
    ingredient: str,
    ingredient_id: int,
    *,
    upgrade: tuple[str, int, int] | None = None,
) -> Recipe:
    recipe = Recipe(
        output_item_unique_name=output,
        output_item_id=output_id,
        enchantment_level=level,
        silver_cost=0,
        crafting_focus=10,
        amount_crafted=1,
        craft_time=Decimal("0"),
        upgrade_resource_unique_name=upgrade[0] if upgrade else None,
        upgrade_resource_item_id=upgrade[1] if upgrade else None,
        upgrade_resource_count=upgrade[2] if upgrade else None,
    )
    recipe.ingredients.append(
        RecipeIngredient(
            ingredient_unique_name=ingredient,
            ingredient_item_id=ingredient_id,
            count=2,
            enchantment_level=level,
            position=0,
        )
    )
    return recipe


async def _seed_chain(db_session, *, include_level_one: bool = True) -> None:
    items = [
        _item("T4_SWORD", 800_000),
        _item("T4_SWORD@1", 800_001, 1),
        _item("T4_SWORD@2", 800_002, 2),
        _item("T4_BAR", 800_003),
        _item("T4_BAR@1", 800_004, 1),
        _item("T4_BAR@2", 800_005, 2),
        _item("T4_RUNE", 800_006),
        _item("T4_SOUL", 800_007),
    ]
    db_session.add_all(items)
    recipes = [
        _recipe("T4_SWORD", 800_000, 0, "T4_BAR", 800_003),
        _recipe(
            "T4_SWORD@2",
            800_002,
            2,
            "T4_BAR@2",
            800_005,
            upgrade=("T4_SOUL", 800_007, 1),
        ),
    ]
    if include_level_one:
        recipes.append(
            _recipe(
                "T4_SWORD@1",
                800_001,
                1,
                "T4_BAR@1",
                800_004,
                upgrade=("T4_RUNE", 800_006, 1),
            )
        )
    db_session.add_all(recipes)
    await db_session.commit()


def _order(
    item: str,
    location: str,
    side: str,
    price: int,
    amount: int,
    *,
    enchantment: int = 0,
) -> MarketOrder:
    return MarketOrder(
        server_id="west",
        source_id=uuid.uuid4().int % 9_000_000_000 + 1,
        item_id=item,
        group_type_id="",
        location_id=location,
        quality_level=1,
        enchantment_level=enchantment,
        unit_price_silver=Decimal(price),
        amount=amount,
        auction_type=side,
        expires=datetime.now(timezone.utc) + timedelta(days=30),
        last_seen_at=datetime.now(timezone.utc),
    )


def _payload(**overrides) -> dict:
    payload = {
        "server": "west",
        "output_item": "T4_SWORD@2",
        "quantity": 2,
        "return_rate": "0",
        "station_fee_per_100_nutrition": "0",
        "acquisition_mode": "immediate",
        "sale_mode": "immediate",
    }
    payload.update(overrides)
    return payload


async def test_compare_requires_jwt_and_publishes_contract(client) -> None:
    assert (await client.post("/craft/compare", json=_payload())).status_code == 401
    operation = (await client.get("/openapi.json")).json()["paths"]["/craft/compare"]["post"]
    assert operation["requestBody"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/CraftCompareRequest"
    }


async def test_ranks_curated_cities_and_returns_three_routes_with_full_upgrade_chain(
    cliente_autenticado, db_session
) -> None:
    await _seed_chain(db_session)
    db_session.add_all(
        [
            Location(location_id="1002", name="Lymhurst", kind="city", is_royal_city=True),
            Location(location_id="5003", name="Brecilien", kind="city", is_royal_city=False),
            Location(location_id="9999", name="Sem dados", kind="city", is_royal_city=False),
            Location(location_id="7777", name=None, kind="city", is_royal_city=False),
            _order("T4_SWORD@2", "1002", "offer", 500, 10, enchantment=2),
            _order("T4_SWORD@2", "1002", "request", 600, 10, enchantment=2),
            _order("T4_BAR@2", "1002", "offer", 100, 1, enchantment=2),
            _order("T4_BAR@2", "1002", "offer", 200, 10, enchantment=2),
            _order("T4_BAR", "1002", "offer", 20, 10),
            _order("T4_RUNE", "1002", "offer", 5, 10),
            _order("T4_SOUL", "1002", "offer", 5, 10),
            _order("T4_SWORD@2", "5003", "offer", 500, 10, enchantment=2),
            _order("T4_SWORD@2", "5003", "request", 500, 10, enchantment=2),
            _order("T4_BAR@2", "5003", "offer", 150, 10, enchantment=2),
            _order("T4_BAR", "5003", "offer", 100, 10),
            _order("T4_RUNE", "5003", "offer", 100, 10),
            _order("T4_SOUL", "5003", "offer", 100, 10),
        ]
    )
    await db_session.commit()

    response = await cliente_autenticado.post("/craft/compare", json=_payload())

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["same_city_only"] is True
    assert body["transport_included"] is False
    assert [city["location_name"] for city in body["ranked_cities"]] == [
        "Lymhurst",
        "Brecilien",
    ]
    assert [city["location_name"] for city in body["unavailable_cities"]] == ["Sem dados"]
    assert all(city["location_id"] != "7777" for city in body["ranked_cities"])

    lymhurst = body["ranked_cities"][0]
    assert {route["route"] for route in lymhurst["routes"]} == {
        "buy_ready",
        "craft_direct",
        "base_upgrade",
    }
    assert lymhurst["best_route"] == "base_upgrade"
    base_route = next(route for route in lymhurst["routes"] if route["route"] == "base_upgrade")
    assert [(step["from_level"], step["to_level"]) for step in base_route["upgrade_steps"]] == [
        (0, 1),
        (1, 2),
    ]
    assert [step["quantity"] for step in base_route["upgrade_steps"]] == [2, 2]
    direct = next(route for route in lymhurst["routes"] if route["route"] == "craft_direct")
    ingredient_quote = direct["acquisition_quotes"][0]["quote"]
    assert ingredient_quote["total"] == "700.0000"
    assert [level["quantity"] for level in ingredient_quote["levels"]] == [1, 3]
    assert ingredient_quote["oldest_observed_at"] is not None


async def test_missing_intermediate_upgrade_link_only_disables_chain(
    cliente_autenticado, db_session
) -> None:
    await _seed_chain(db_session, include_level_one=False)
    db_session.add(Location(location_id="1002", name="Lymhurst", kind="city", is_royal_city=True))
    await db_session.commit()
    payload = _payload(
        manual_prices={
            "T4_SWORD@2": {"offer": "500", "request": "600"},
            "T4_BAR@2": {"offer": "100"},
            "T4_BAR": {"offer": "20"},
            "T4_SOUL": {"offer": "5"},
        }
    )

    body = (await cliente_autenticado.post("/craft/compare", json=payload)).json()

    city = body["ranked_cities"][0]
    chain = next(route for route in city["routes"] if route["route"] == "base_upgrade")
    assert chain["available"] is False
    assert chain["unavailable_reason"] == "receita_upgrade_nivel_1_indisponivel"
    assert (
        next(route for route in city["routes"] if route["route"] == "craft_direct")["available"]
        is True
    )


async def test_selected_order_modes_use_correct_sides_and_fees(
    cliente_autenticado, db_session
) -> None:
    await _seed_chain(db_session)
    db_session.add(Location(location_id="1002", name="Lymhurst", kind="city", is_royal_city=True))
    await db_session.commit()
    payload = _payload(
        acquisition_mode="buy_order",
        sale_mode="sell_order",
        manual_prices={
            "T4_SWORD@2": {"offer": "700", "request": "600"},
            "T4_BAR@2": {"request": "90"},
            "T4_BAR": {"request": "20"},
            "T4_RUNE": {"request": "5"},
            "T4_SOUL": {"request": "5"},
        },
    )

    body = (await cliente_autenticado.post("/craft/compare", json=payload)).json()

    direct = next(
        route for route in body["ranked_cities"][0]["routes"] if route["route"] == "craft_direct"
    )
    assert direct["costs"]["ingredient_cost"] == "360"
    assert direct["costs"]["acquisition_setup_fee"] == "9"
    assert direct["net_revenue"] == "1309"
    assert direct["warnings"] == ["ordem_nao_garantida"]


async def _compare_counting_selects(db_session, request, user_id):
    selects: list[str] = []

    def _on_execute(conn, cursor, statement, parameters, context, executemany):
        if "SELECT" in statement.upper():
            selects.append(statement)

    event.listen(db_engine.sync_engine, "before_cursor_execute", _on_execute)
    try:
        result = await compare_craft(db_session, request, user_id)
    finally:
        event.remove(db_engine.sync_engine, "before_cursor_execute", _on_execute)
    return result, selects


async def test_compare_query_count_does_not_grow_with_city_count(db_session, usuario) -> None:
    """Mede antes e depois de somar 12 cidades, em vez de fixar números.

    Os dois números fixos que havia aqui envelheceram: a contagem de cidades (12) quebrou quando a
    migration `f2d7e8f9a0b1` deixou o `1301` de Lymhurst gravado como cidade, e o teto de 6 SELECTs
    quando a task 4/18 somou `get_item_values` — uma consulta para a família toda, não por cidade.
    A medida de base precisa de uma cidade: sem nenhuma, cobertura e livro retornam antes de
    consultar.
    """
    await _seed_chain(db_session)
    db_session.add(Location(location_id="1002", name="Lymhurst", kind="city", is_royal_city=True))
    await db_session.commit()
    request = CraftCompareRequest.model_validate(
        _payload(
            manual_prices={
                "T4_SWORD@2": {"offer": "500", "request": "600"},
                "T4_BAR@2": {"offer": "100"},
                "T4_BAR": {"offer": "20"},
                "T4_RUNE": {"offer": "5"},
                "T4_SOUL": {"offer": "5"},
            }
        )
    )
    cidades_antes = len(await list_eligible_craft_locations(db_session))
    _, selects_antes = await _compare_counting_selects(db_session, request, usuario.id)

    for index in range(12):
        db_session.add(
            Location(
                location_id=str(10_000 + index),
                name=f"Cidade {index}",
                kind="city",
                is_royal_city=False,
            )
        )
    await db_session.commit()
    result, selects = await _compare_counting_selects(db_session, request, usuario.id)

    assert len(result["ranked_cities"]) == cidades_antes + 12
    assert len(selects) == len(selects_antes), [
        " ".join(s.split("FROM", 1)[-1].split())[:90] for s in selects
    ]
