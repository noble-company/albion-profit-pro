import uuid

from sqlalchemy import event, func, select

from src.database import engine
from src.recipes.models import Recipe
from src.saved_crafts.models import SavedCraft
from src.saved_crafts.service import MAX_SAVED_CRAFTS_PER_REALM
from tests.conftest import registrar_e_logar


async def add_recipe(db_session, output_item: str, kind: str = "crafting") -> None:
    db_session.add(
        Recipe(
            output_item_unique_name=output_item,
            output_item_id=None,
            enchantment_level=0,
            silver_cost=0,
            crafting_focus=0,
            amount_crafted=1,
            production_kind=kind,
            craft_time=0,
        )
    )
    await db_session.commit()


def payload(output_item: str = "T4_2H_MACE", **overrides):
    return {
        "server": "west",
        "output_item": output_item,
        "quantity": 100,
        "output_quality": 2,
        **overrides,
    }


async def test_create_list_and_delete_saved_craft(cliente_autenticado, db_session):
    await add_recipe(db_session, "T4_2H_MACE")

    created = await cliente_autenticado.post("/me/saved-crafts", json=payload())
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["server"] == "west"
    assert body["output_item"] == "T4_2H_MACE"
    assert body["quantity"] == 100
    assert body["output_quality"] == 2
    assert body["created_at"]
    assert body["updated_at"]

    listed = await cliente_autenticado.get("/me/saved-crafts", params={"server": "west"})
    assert listed.status_code == 200
    assert [row["id"] for row in listed.json()] == [body["id"]]

    deleted = await cliente_autenticado.delete(f"/me/saved-crafts/{body['id']}")
    assert deleted.status_code == 204
    assert (
        await cliente_autenticado.get("/me/saved-crafts", params={"server": "west"})
    ).json() == []


async def test_same_recipe_can_be_saved_twice(cliente_autenticado, db_session):
    await add_recipe(db_session, "T4_2H_MACE")
    first = await cliente_autenticado.post("/me/saved-crafts", json=payload())
    second = await cliente_autenticado.post(
        "/me/saved-crafts", json=payload(quantity=20, output_quality=4)
    )
    assert first.status_code == second.status_code == 201
    assert first.json()["id"] != second.json()["id"]


async def test_realms_are_listed_separately(cliente_autenticado, db_session):
    await add_recipe(db_session, "T4_2H_MACE")
    await cliente_autenticado.post("/me/saved-crafts", json=payload(server="west"))
    await cliente_autenticado.post("/me/saved-crafts", json=payload(server="east"))

    west = await cliente_autenticado.get("/me/saved-crafts", params={"server": "west"})
    east = await cliente_autenticado.get("/me/saved-crafts", params={"server": "east"})
    assert [row["server"] for row in west.json()] == ["west"]
    assert [row["server"] for row in east.json()] == ["east"]


async def test_saved_crafts_are_isolated_by_user(client, db_session):
    await add_recipe(db_session, "T4_2H_MACE")
    _, owner_token = await registrar_e_logar(client)
    _, outsider_token = await registrar_e_logar(client)

    created = await client.post(
        "/me/saved-crafts",
        json=payload(),
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    saved_id = created.json()["id"]

    outsider_headers = {"Authorization": f"Bearer {outsider_token}"}
    listed = await client.get(
        "/me/saved-crafts", params={"server": "west"}, headers=outsider_headers
    )
    deleted = await client.delete(f"/me/saved-crafts/{saved_id}", headers=outsider_headers)
    assert listed.json() == []
    assert deleted.status_code == 404


async def test_recipe_must_exist_and_accepts_crafting_or_refining(cliente_autenticado, db_session):
    missing = await cliente_autenticado.post("/me/saved-crafts", json=payload("T4_MISSING"))
    assert missing.status_code == 422
    assert missing.json()["detail"] == "recipe_unavailable"

    await add_recipe(db_session, "T4_CLOTH", "refining")
    refining = await cliente_autenticado.post(
        "/me/saved-crafts",
        json=payload("T4_CLOTH", output_quality=1),
    )
    assert refining.status_code == 201
    assert refining.json()["output_item"] == "T4_CLOTH"


async def test_input_ranges_are_validated(cliente_autenticado):
    for field, value in (
        ("server", "invalid"),
        ("quantity", 0),
        ("quantity", 1_000_001),
        ("output_quality", 0),
        ("output_quality", 6),
    ):
        response = await cliente_autenticado.post(
            "/me/saved-crafts", json=payload(**{field: value})
        )
        assert response.status_code == 422, (field, value, response.text)


async def test_limit_is_per_user_and_realm(cliente_autenticado, db_session, usuario):
    await add_recipe(db_session, "T4_2H_MACE")
    db_session.add_all(
        SavedCraft(
            user_id=usuario.id,
            server="west",
            output_item="T4_2H_MACE",
            quantity=1,
            output_quality=1,
        )
        for _ in range(MAX_SAVED_CRAFTS_PER_REALM)
    )
    await db_session.commit()

    full = await cliente_autenticado.post("/me/saved-crafts", json=payload(server="west"))
    other_realm = await cliente_autenticado.post("/me/saved-crafts", json=payload(server="east"))
    assert full.status_code == 409
    assert full.json()["detail"] == "saved_craft_limit_reached"
    assert other_realm.status_code == 201


async def test_user_delete_cascades_saved_crafts(db_session, usuario):
    saved = SavedCraft(
        user_id=usuario.id,
        server="west",
        output_item="T4_2H_MACE",
        quantity=1,
        output_quality=1,
    )
    db_session.add(saved)
    await db_session.commit()

    await db_session.delete(usuario)
    await db_session.commit()

    total = await db_session.scalar(select(func.count()).select_from(SavedCraft))
    assert total == 0


async def test_openapi_contract_is_english(client):
    schema = (await client.get("/openapi.json")).json()
    operation = schema["paths"]["/me/saved-crafts"]["post"]
    fields = schema["components"]["schemas"]["SavedCraftCreate"]["properties"]
    assert set(fields) == {"server", "output_item", "quantity", "output_quality"}
    assert operation["responses"]["201"]


async def test_delete_unknown_id_returns_404(cliente_autenticado):
    response = await cliente_autenticado.delete(f"/me/saved-crafts/{uuid.uuid4()}")
    assert response.status_code == 404


async def test_routes_require_authentication(client):
    assert (await client.get("/me/saved-crafts", params={"server": "west"})).status_code == 401
    assert (await client.post("/me/saved-crafts", json=payload())).status_code == 401
    assert (await client.delete(f"/me/saved-crafts/{uuid.uuid4()}")).status_code == 401


async def test_list_statement_count_does_not_grow_with_saved_rows(
    cliente_autenticado, db_session, usuario
):
    counter = {"selects": 0}

    def count_selects(conn, cursor, statement, parameters, context, executemany):
        if statement.lstrip().upper().startswith("SELECT"):
            counter["selects"] += 1

    event.listen(engine.sync_engine, "before_cursor_execute", count_selects)
    try:
        await cliente_autenticado.get("/me/saved-crafts", params={"server": "west"})
        empty_count = counter["selects"]

        db_session.add_all(
            SavedCraft(
                user_id=usuario.id,
                server="west",
                output_item=f"T4_TEST_{index}",
                quantity=1,
                output_quality=1,
            )
            for index in range(40)
        )
        await db_session.commit()

        counter["selects"] = 0
        response = await cliente_autenticado.get("/me/saved-crafts", params={"server": "west"})
        populated_count = counter["selects"]
    finally:
        event.remove(engine.sync_engine, "before_cursor_execute", count_selects)

    assert response.status_code == 200
    assert len(response.json()) == 40
    assert populated_count == empty_count
