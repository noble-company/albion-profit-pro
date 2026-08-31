from sqlalchemy import text

from src.items.models import Item, Location
from src.items.normalization import normalize_item_search
from src.recipes.models import Recipe


def _item(
    unique_name: str,
    *,
    name_pt: str | None,
    name_en: str | None,
    tier: int,
    enchantment_level: int = 0,
    category: str = "crafting",
    subcategory: str = "resources",
) -> Item:
    return Item(
        unique_name=unique_name,
        name_pt=name_pt,
        name_en=name_en,
        tier=tier,
        enchantment_level=enchantment_level,
        shop_category=category,
        shop_subcategory=subcategory,
        busca_normalizada=normalize_item_search(unique_name, name_pt, name_en),
    )


async def _seed_catalog(db_session):
    fiber = _item("T4_FIBER", name_pt="Algodão", name_en="Cotton", tier=4)
    cloth = _item("T4_CLOTH", name_pt="Tecido", name_en="Cloth", tier=4)
    enchanted = _item(
        "T4_CLOTH@1",
        name_pt="Tecido Encantado",
        name_en="Enchanted Cloth",
        tier=4,
        enchantment_level=1,
    )
    sword = _item(
        "T5_MAIN_SWORD",
        name_pt="Espada",
        name_en="Sword",
        tier=5,
        category="equipment",
        subcategory="sword",
    )
    db_session.add_all([fiber, cloth, enchanted, sword])
    db_session.add(Recipe(output_item_unique_name="T4_CLOTH"))
    db_session.add_all(
        [
            Location(
                location_id="1002",
                name="Lymhurst",
                kind="city",
                is_royal_city=True,
            ),
            Location(
                location_id="UNKNOWN-LOCATION",
                name=None,
                kind="desconhecido",
                is_royal_city=False,
            ),
        ]
    )
    await db_session.commit()


async def test_catalog_requires_jwt(client):
    assert (await client.get("/items/search", params={"q": "cotton"})).status_code == 401
    assert (await client.get("/items/T4_CLOTH")).status_code == 401
    assert (await client.get("/locations")).status_code == 401


async def test_search_normalizes_accents_languages_and_unique_name(cliente_autenticado, db_session):
    await _seed_catalog(db_session)

    for query in ("algodao", "algodão", "cotton", "T4_FIBER"):
        response = await cliente_autenticado.get("/items/search", params={"q": query})
        assert response.status_code == 200, response.text
        assert response.json()[0]["unique_name"] == "T4_FIBER"


async def test_search_filters_and_limit(cliente_autenticado, db_session):
    await _seed_catalog(db_session)

    response = await cliente_autenticado.get(
        "/items/search",
        params={
            "q": "t",
            "tier": 4,
            "enchantment_level": 0,
            "categoria": "resources",
            "apenas_craftaveis": True,
            "limit": 1,
        },
    )
    assert response.status_code == 200, response.text
    assert [item["unique_name"] for item in response.json()] == ["T4_CLOTH"]
    assert response.json()[0]["tem_receita"] is True

    invalid = await cliente_autenticado.get("/items/search", params={"q": "t", "limit": 51})
    assert invalid.status_code == 422

    blank = await cliente_autenticado.get("/items/search", params={"q": "   "})
    assert blank.status_code == 422
    assert blank.json()["detail"] == "termo_de_busca_vazio"

    wildcard = await cliente_autenticado.get("/items/search", params={"q": "%"})
    assert wildcard.status_code == 200
    assert wildcard.json() == []


async def test_item_detail_and_semantic_not_found(cliente_autenticado, db_session):
    await _seed_catalog(db_session)

    response = await cliente_autenticado.get("/items/T4_CLOTH")
    assert response.status_code == 200
    assert response.json()["tem_receita"] is True

    missing = await cliente_autenticado.get("/items/DOES_NOT_EXIST")
    assert missing.status_code == 404
    assert missing.json()["detail"] == "item_nao_encontrado"


async def test_locations_use_name_or_id_fallback(cliente_autenticado, db_session):
    await _seed_catalog(db_session)

    response = await cliente_autenticado.get("/locations")
    assert response.status_code == 200
    locations = {row["location_id"]: row for row in response.json()}
    assert locations["1002"]["display_name"] == "Lymhurst"
    assert locations["1002"]["is_royal_city"] is True
    assert locations["UNKNOWN-LOCATION"]["display_name"] == "UNKNOWN-LOCATION"


async def test_search_index_is_gin_trigram(db_session):
    row = await db_session.execute(
        text(
            "SELECT indexdef FROM pg_indexes "
            "WHERE schemaname = 'public' AND indexname = 'ix_item_busca_normalizada_trgm'"
        )
    )
    index_definition = row.scalar_one()
    assert "USING gin" in index_definition
    assert "gin_trgm_ops" in index_definition

    # Desabilitar seqscan aqui não compara custos: apenas prova que a consulta
    # representativa é elegível para o índice criado pela migração.
    await db_session.execute(text("SET LOCAL enable_seqscan = off"))
    plan_rows = await db_session.execute(
        text(
            "EXPLAIN (COSTS OFF) SELECT unique_name FROM item "
            "WHERE busca_normalizada LIKE '%cotton%'"
        )
    )
    plan = "\n".join(plan_rows.scalars())
    assert "ix_item_busca_normalizada_trgm" in plan
