from decimal import Decimal

from src.items.models import Item
from src.recipes.models import Recipe, RecipeIngredient


def _item(unique_name: str, albion_id: int, name: str) -> Item:
    _, separator, suffix = unique_name.rpartition("@")
    return Item(
        unique_name=unique_name,
        albion_id=albion_id,
        name_pt=name,
        name_en=f"{name} EN",
        enchantment_level=int(suffix) if separator else 0,
        busca_normalizada=unique_name.casefold(),
    )


async def _seed_recipes(db_session):
    items = [
        _item("T4_OFF_SHIELD", 4001, "Escudo"),
        _item("T4_OFF_SHIELD@1", 4002, "Escudo encantado"),
        _item("T4_OFF_SHIELD@2", 4003, "Escudo raro"),
        _item("T4_FIBER", 4101, "Fibra"),
        _item("T3_CLOTH", 3101, "Tecido T3"),
        _item("T4_RUNE", 4201, "Runa"),
        _item("T4_HIDE", 4301, "Couro cru"),
    ]
    db_session.add_all(items)

    base = Recipe(
        output_item_unique_name="T4_OFF_SHIELD",
        output_item_id=4001,
        silver_cost=7,
        crafting_focus=31,
        amount_crafted=1,
        craft_time=Decimal("0.03125"),
    )
    # Inserção deliberadamente invertida: a API precisa respeitar `position`.
    base.ingredients.extend(
        [
            RecipeIngredient(
                ingredient_unique_name="T3_CLOTH",
                ingredient_item_id=3101,
                count=1,
                position=1,
            ),
            RecipeIngredient(
                ingredient_unique_name="T4_FIBER",
                ingredient_item_id=4101,
                count=2,
                position=0,
            ),
        ]
    )
    enchanted = Recipe(
        output_item_unique_name="T4_OFF_SHIELD@1",
        output_item_id=4002,
        enchantment_level=1,
        upgrade_resource_unique_name="T4_RUNE",
        upgrade_resource_item_id=4201,
        upgrade_resource_count=8,
    )
    enchanted.ingredients.append(
        RecipeIngredient(
            ingredient_unique_name="T4_FIBER",
            ingredient_item_id=4101,
            count=2,
            enchantment_level=1,
            position=0,
        )
    )
    level_two = Recipe(
        output_item_unique_name="T4_OFF_SHIELD@2",
        output_item_id=4003,
        enchantment_level=2,
    )
    level_two.ingredients.append(
        RecipeIngredient(
            ingredient_unique_name="T4_FIBER",
            ingredient_item_id=4101,
            count=2,
            enchantment_level=2,
            position=0,
        )
    )
    own_ingredient_recipe = Recipe(
        output_item_unique_name="T3_CLOTH",
        output_item_id=3101,
    )
    own_ingredient_recipe.ingredients.append(
        RecipeIngredient(
            ingredient_unique_name="T4_FIBER",
            ingredient_item_id=4101,
            count=1,
            position=0,
        )
    )
    # Receita sem Item correspondente não é uma variante existente no catálogo.
    ghost = Recipe(output_item_unique_name="T4_OFF_SHIELD@3", enchantment_level=3)
    db_session.add_all([base, enchanted, level_two, own_ingredient_recipe, ghost])
    await db_session.commit()


async def test_recipe_requires_jwt(client):
    response = await client.get("/items/T4_OFF_SHIELD/recipe")
    assert response.status_code == 401


async def test_recipe_contract_is_published_in_openapi(client):
    response = await client.get("/openapi.json")
    assert response.status_code == 200
    operation = response.json()["paths"]["/items/{unique_name}/recipe"]["get"]
    assert operation["responses"]["200"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/RecipeOut"
    }


async def test_base_recipe_has_ordered_enriched_ingredients_and_variants(
    cliente_autenticado, db_session
):
    await _seed_recipes(db_session)

    response = await cliente_autenticado.get("/items/T4_OFF_SHIELD/recipe")

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["output"] == {
        "unique_name": "T4_OFF_SHIELD",
        "albion_id": 4001,
        "name_pt": "Escudo",
        "name_en": "Escudo EN",
    }
    assert body["silver_cost"] == 7
    assert body["crafting_focus"] == 31
    assert body["amount_crafted"] == 1
    assert body["craft_time"] == "0.03125"
    assert [row["unique_name"] for row in body["ingredients"]] == [
        "T4_FIBER",
        "T3_CLOTH",
    ]
    assert [row["position"] for row in body["ingredients"]] == [0, 1]
    assert body["ingredients"][0]["tem_receita_propria"] is False
    assert body["ingredients"][1]["tem_receita_propria"] is True
    assert body["ingredients"][0]["name_pt"] == "Fibra"
    assert body["upgrade_resource"] is None
    assert body["variantes_encantadas"] == ["T4_OFF_SHIELD@1", "T4_OFF_SHIELD@2"]


async def test_enchanted_key_is_exact_and_has_upgrade_resource(cliente_autenticado, db_session):
    await _seed_recipes(db_session)

    response = await cliente_autenticado.get("/items/T4_OFF_SHIELD@1/recipe")

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["output"]["unique_name"] == "T4_OFF_SHIELD@1"
    assert body["enchantment_level"] == 1
    assert body["upgrade_resource"] == {
        "unique_name": "T4_RUNE",
        "albion_id": 4201,
        "name_pt": "Runa",
        "name_en": "Runa EN",
        "count": 8,
    }
    assert body["variantes_encantadas"] == ["T4_OFF_SHIELD@1", "T4_OFF_SHIELD@2"]


async def test_resource_style_enchanted_keys_share_the_same_variant_family(
    cliente_autenticado, db_session
):
    db_session.add_all(
        [
            _item("T4_PLANKS_LEVEL1@1", 5001, "Tábuas incomuns"),
            _item("T4_PLANKS_LEVEL2@2", 5002, "Tábuas raras"),
            _item("T4_WOOD", 5101, "Madeira"),
        ]
    )
    for level in (1, 2):
        recipe = Recipe(
            output_item_unique_name=f"T4_PLANKS_LEVEL{level}@{level}",
            output_item_id=5000 + level,
            enchantment_level=level,
        )
        recipe.ingredients.append(
            RecipeIngredient(
                ingredient_unique_name="T4_WOOD",
                ingredient_item_id=5101,
                count=2,
                enchantment_level=level,
                position=0,
            )
        )
        db_session.add(recipe)
    await db_session.commit()

    response = await cliente_autenticado.get("/items/T4_PLANKS_LEVEL1@1/recipe")

    assert response.status_code == 200, response.text
    assert response.json()["variantes_encantadas"] == [
        "T4_PLANKS_LEVEL1@1",
        "T4_PLANKS_LEVEL2@2",
    ]


async def test_recipe_uses_two_semantic_404_codes(cliente_autenticado, db_session):
    await _seed_recipes(db_session)

    missing_item = await cliente_autenticado.get("/items/DOES_NOT_EXIST/recipe")
    unavailable = await cliente_autenticado.get("/items/T4_HIDE/recipe")

    assert missing_item.status_code == 404
    assert missing_item.json()["detail"] == "item_nao_encontrado"
    assert unavailable.status_code == 404
    assert unavailable.json()["detail"] == "receita_indisponivel"
