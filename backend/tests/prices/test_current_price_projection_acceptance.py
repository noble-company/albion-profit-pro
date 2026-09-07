"""Critérios de aceite da projeção de preço atual, no limite HTTP (task 3.5/28).

As specs 20.1 e 20.3 da extensão de snapshots definem o comportamento; a projeção da última
observação (`latest_order_observation_filter`) é a implementação aceita no lugar de snapshots
persistidos. A cobertura de baixo nível vive em `tests/prices/test_service.py`; aqui os mesmos
critérios são exercitados de ponta a ponta pelos motores que o usuário toca:
`/opportunities/flips` e `/craft/simulate`.

Cada teste bloqueia uma regressão concreta: uma ordem de observação anterior voltando a
competir, ou um preço velho virando cálculo silencioso.
"""

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from src.items.models import Item
from src.prices.models import MarketOrder
from src.recipes.models import Recipe, RecipeIngredient
from tests.conftest import registrar_e_logar

# > 5s (LATEST_OBSERVATION_TOLERANCE) e dentro da janela de frescor de 6h.
OLDER_OBSERVATION = timedelta(minutes=20)


def _item_id() -> str:
    return f"T15_SNAPTEST_{uuid.uuid4().hex[:10]}"


def _order(
    item_id: str,
    location_id: str,
    auction_type: str,
    price: str,
    amount: int,
    *,
    seen_ago: timedelta = timedelta(0),
) -> MarketOrder:
    now = datetime.now(timezone.utc)
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
        expires=now + timedelta(days=30),
        last_seen_at=now - seen_ago,
    )


# --- /opportunities/flips ---------------------------------------------------------------


async def test_flip_quotes_the_newest_observation_and_drops_the_older_orders(client, db_session):
    """20.1(3)/20.3(1): a observação nova vence, mesmo quando o preço novo é menor — e as
    ordens da observação anterior (inclusive uma ainda mais barata) não voltam a competir."""
    _, token = await registrar_e_logar(client)
    item_id = _item_id()
    db_session.add(Item(unique_name=item_id, albion_id=uuid.uuid4().int % 1_000_000_000))
    db_session.add_all(
        [
            # observação anterior no lado de compra: some depois do rescan
            _order(item_id, "1002", "offer", "50", 10, seen_ago=OLDER_OBSERVATION),
            _order(item_id, "1002", "offer", "1000", 10, seen_ago=OLDER_OBSERVATION),
            # observação atual: só uma oferta, a 900
            _order(item_id, "1002", "offer", "900", 10),
            _order(item_id, "3005", "request", "2000", 10),
        ]
    )
    await db_session.commit()

    body = (
        await client.get(
            "/opportunities/flips",
            params={"server": "west", "location_id": ["1002", "3005"]},
            headers={"Authorization": f"Bearer {token}"},
        )
    ).json()

    assert body["total"] == 1
    opportunity = body["opportunities"][0]
    assert Decimal(opportunity["buy_price"]) == Decimal("900")  # não 50, não 1000


async def test_flip_flags_stale_data_and_require_complete_drops_it(client, db_session):
    """20.1: sem coleta atual, a resposta informa a desatualização (`dado_velho`) — nunca usa
    o preço velho em silêncio — e `require_complete` a exclui de vez."""
    _, token = await registrar_e_logar(client)
    headers = {"Authorization": f"Bearer {token}"}
    item_id = _item_id()
    stale = timedelta(hours=9)  # fora da janela de frescor de 6h
    db_session.add(Item(unique_name=item_id, albion_id=uuid.uuid4().int % 1_000_000_000))
    db_session.add_all(
        [
            _order(item_id, "1002", "offer", "100", 10, seen_ago=stale),
            _order(item_id, "3005", "request", "500", 10, seen_ago=stale),
        ]
    )
    await db_session.commit()

    flagged = (
        await client.get(
            "/opportunities/flips",
            params={"server": "west", "location_id": ["1002", "3005"]},
            headers=headers,
        )
    ).json()
    assert flagged["total"] == 1
    assert flagged["opportunities"][0]["warnings"] == ["dado_velho"]
    assert flagged["opportunities"][0]["oldest_observed_at"] is not None

    complete = (
        await client.get(
            "/opportunities/flips",
            params={
                "server": "west",
                "location_id": ["1002", "3005"],
                "require_complete": "true",
            },
            headers=headers,
        )
    ).json()
    assert complete["total"] == 0


# --- /craft/simulate ------------------------------------------------------------------


async def _seed_two_ingredient_recipe(db_session) -> None:
    output_item = "T2_SNAPCLOTH"
    db_session.add(
        Item(
            unique_name=output_item,
            albion_id=910_000,
            name_pt=output_item,
            name_en=output_item,
            tier=2,
            enchantment_level=0,
            busca_normalizada=output_item.casefold(),
        )
    )
    recipe = Recipe(
        output_item_unique_name=output_item,
        output_item_id=910_000,
        amount_crafted=1,
        silver_cost=0,
        crafting_focus=18,
        craft_time=Decimal("0"),
    )
    db_session.add(
        Item(
            unique_name="T2_SNAPFIBER",
            albion_id=910_001,
            name_pt="T2_SNAPFIBER",
            name_en="T2_SNAPFIBER",
            tier=2,
            enchantment_level=0,
            busca_normalizada="t2_snapfiber",
        )
    )
    recipe.ingredients.append(
        RecipeIngredient(
            ingredient_unique_name="T2_SNAPFIBER",
            ingredient_item_id=910_001,
            count=1,
            enchantment_level=0,
            position=0,
        )
    )
    db_session.add(recipe)
    await db_session.commit()


def _payload(**overrides) -> dict:
    payload = {
        "server": "west",
        "output_item": "T2_SNAPCLOTH",
        "quantity": 4,
        "location_id": "1002",
        "return_rate": "0",
        "station_cost_per_execution": "0",
        "use_focus": True,
        "premium": True,
    }
    payload.update(overrides)
    return payload


async def test_simulate_uses_the_newest_ingredient_observation(cliente_autenticado, db_session):
    """20.3(1)/(4): a Calculadora usa a mesma projeção — a oferta barata de 20 min atrás não
    volta a competir com a observação atual (mais cara)."""
    await _seed_two_ingredient_recipe(db_session)
    db_session.add_all(
        [
            # observação anterior: barata, mas já não está no book
            _order("T2_SNAPFIBER", "1002", "offer", "100", 50, seen_ago=OLDER_OBSERVATION),
            # observação atual: só a oferta a 250
            _order("T2_SNAPFIBER", "1002", "offer", "250", 50),
            _order("T2_SNAPCLOTH", "1002", "request", "500", 50),
        ]
    )
    await db_session.commit()

    body = (await cliente_autenticado.post("/craft/simulate", json=_payload())).json()

    quote = body["ingredients"][0]["immediate_purchase"]
    # 4 execuções × 1 unidade × 250 (observação nova), não 100 (a antiga que sumiu)
    assert Decimal(quote["total"]) == Decimal("1000")


async def test_simulate_reports_stale_ingredient_instead_of_a_silent_price(
    cliente_autenticado, db_session
):
    """20.1: lado só com observação fora da janela → sem preço atual + aviso, nunca lucro
    calculado em silêncio sobre o dado velho."""
    await _seed_two_ingredient_recipe(db_session)
    db_session.add_all(
        [
            _order("T2_SNAPFIBER", "1002", "offer", "100", 50, seen_ago=timedelta(hours=9)),
            _order("T2_SNAPCLOTH", "1002", "request", "500", 50),
        ]
    )
    await db_session.commit()

    body = (await cliente_autenticado.post("/craft/simulate", json=_payload())).json()

    quote = body["ingredients"][0]["immediate_purchase"]
    assert quote["total"] is None
    assert quote["warnings"] == ["dado_velho"]
    scenario = next(
        s
        for s in body["scenarios"]
        if s["acquisition_mode"] == "immediate" and s["sale_mode"] == "immediate"
    )
    assert scenario["profit"] is None
