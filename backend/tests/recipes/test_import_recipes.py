"""
Roda o import de verdade (`import_recipes()`) contra um recorte pequeno de
JSON de teste — não o dump de 17MB real — monkeypatchando os caminhos de
arquivo do módulo. Roda no Postgres efêmero da sessão (task 20), então não há
mais risco de colidir com dados reais de produção (achado real que aconteceu
quando isso ainda rodava contra o Postgres local do docker-compose — ver
histórico da task 19); os nomes com prefixo `ZZFIXTURE_` foram mantidos por
clareza, não por necessidade.
"""

import json

from sqlalchemy import select

import scripts.import_recipes as import_recipes_module
from src.recipes.models import Recipe, RecipeIngredient

FIXTURE_NAMES = [
    "ZZFIXTURE_CLOTH_T2",
    "ZZFIXTURE_CLOTH_T2@1",
    "ZZFIXTURE_CLOTH_T2@2",
    "ZZFIXTURE_CLOTH_T3",
    "ZZFIXTURE_LOOT_ONLY",
    "ZZFIXTURE_MULTI_RECIPE",
]

ITEM_DUMP_FIXTURE = {
    "items": {
        "simpleitem": [
            {
                "@uniquename": "ZZFIXTURE_CLOTH_T2",
                "craftingrequirements": {
                    "@silver": "0",
                    "@time": "0.02083",
                    "@craftingfocus": "18",
                    "@amountcrafted": "1",
                    "craftresource": {
                        "@uniquename": "ZZFIXTURE_FIBER_T2",
                        "@count": "1",
                        "@enchantmentlevel": "0",
                    },
                },
                "enchantments": {
                    "enchantment": [
                        {
                            # nível 1: craftingrequirements de verdade (dict) +
                            # upgraderequirements — testa a receita encantada E
                            # o custo de upgrade juntos.
                            "@enchantmentlevel": "1",
                            "craftingrequirements": {
                                "@silver": "0",
                                "@time": "0.05",
                                "@craftingfocus": "40",
                                "@amountcrafted": "1",
                                "craftresource": {
                                    "@uniquename": "ZZFIXTURE_FIBER_T2_LEVEL1",
                                    "@count": "1",
                                    "@enchantmentlevel": "1",
                                },
                            },
                            "upgraderequirements": {
                                "upgraderesource": {
                                    "@uniquename": "ZZFIXTURE_RUNE",
                                    "@count": "8",
                                }
                            },
                        },
                        {
                            # nível 2: craftingrequirements como LISTA — deve
                            # ser pulado (mesmo tratamento da receita base),
                            # sem quebrar o import nem os outros níveis.
                            "@enchantmentlevel": "2",
                            "craftingrequirements": [
                                {
                                    "@time": "0.06",
                                    "craftresource": {
                                        "@uniquename": "ZZFIXTURE_FIBER_T2_LEVEL2",
                                        "@count": "1",
                                    },
                                },
                                {
                                    "@time": "0.07",
                                    "craftresource": {
                                        "@uniquename": "ZZFIXTURE_FIBER_T3_LEVEL2",
                                        "@count": "1",
                                    },
                                },
                            ],
                        },
                    ]
                },
            },
            {
                "@uniquename": "ZZFIXTURE_CLOTH_T3",
                "craftingrequirements": {
                    "@silver": "0",
                    "@time": "0.03",
                    "@craftingfocus": "20",
                    "@amountcrafted": "1",
                    "craftresource": [
                        {
                            "@uniquename": "ZZFIXTURE_FIBER_T3",
                            "@count": "2",
                            "@enchantmentlevel": "0",
                        },
                        {
                            "@uniquename": "ZZFIXTURE_CLOTH_T2",
                            "@count": "1",
                            "@enchantmentlevel": "0",
                        },
                    ],
                },
            },
            {
                # item sem craftingrequirements (ex: loot-only) — não deve virar Recipe
                "@uniquename": "ZZFIXTURE_LOOT_ONLY",
            },
            {
                # craftingrequirements como LISTA (achado real no dump — ex:
                # T1_FISHCHOPS) — não modelável ainda (Recipe.output_item_unique_name
                # é UNIQUE), deve ser pulado sem quebrar o import.
                "@uniquename": "ZZFIXTURE_MULTI_RECIPE",
                "craftingrequirements": [
                    {
                        "@time": "0.01",
                        "@amountcrafted": "1",
                        "craftresource": {"@uniquename": "ZZFIXTURE_FIBER_T2", "@count": "1"},
                    },
                    {
                        "@time": "0.02",
                        "@amountcrafted": "2",
                        "craftresource": {"@uniquename": "ZZFIXTURE_FIBER_T3", "@count": "1"},
                    },
                ],
            },
        ]
    }
}

# ZZFIXTURE_CLOTH_T3 e ZZFIXTURE_RUNE deliberadamente ausentes daqui — testam
# o caminho "sem correspondência em items.json" (output_item_id/
# upgrade_resource_item_id devem ficar None, sem quebrar o import).
ITEMS_JSON_FIXTURE = [
    {"UniqueName": "ZZFIXTURE_FIBER_T2", "Index": "900001"},
    {"UniqueName": "ZZFIXTURE_FIBER_T3", "Index": "900002"},
    {"UniqueName": "ZZFIXTURE_CLOTH_T2", "Index": "900003"},
    {"UniqueName": "ZZFIXTURE_CLOTH_T2@1", "Index": "900004"},
    {"UniqueName": "ZZFIXTURE_FIBER_T2_LEVEL1", "Index": "900005"},
]


def _use_fixture_paths(tmp_path):
    item_dump_path = tmp_path / "ITEM DUMP.json"
    items_json_path = tmp_path / "items.json"
    item_dump_path.write_text(json.dumps(ITEM_DUMP_FIXTURE), encoding="utf-8")
    items_json_path.write_text(json.dumps(ITEMS_JSON_FIXTURE), encoding="utf-8")

    original_item_dump_path = import_recipes_module.ITEM_DUMP_PATH
    original_items_json_path = import_recipes_module.ITEMS_JSON_PATH
    import_recipes_module.ITEM_DUMP_PATH = item_dump_path
    import_recipes_module.ITEMS_JSON_PATH = items_json_path
    return original_item_dump_path, original_items_json_path


async def test_import_recipes_resolves_ids_and_handles_missing_correspondence(tmp_path, db_session):
    original_paths = _use_fixture_paths(tmp_path)
    try:
        await import_recipes_module.import_recipes()
    finally:
        import_recipes_module.ITEM_DUMP_PATH, import_recipes_module.ITEMS_JSON_PATH = original_paths

    result = await db_session.execute(
        select(Recipe).where(
            Recipe.output_item_unique_name.in_(["ZZFIXTURE_CLOTH_T2", "ZZFIXTURE_CLOTH_T3"])
        )
    )
    recipes = {r.output_item_unique_name: r for r in result.scalars().all()}

    ingredients_result = await db_session.execute(
        select(RecipeIngredient).where(
            RecipeIngredient.recipe_id.in_([r.id for r in recipes.values()])
        )
    )
    ingredients = ingredients_result.scalars().all()

    assert set(recipes.keys()) == {"ZZFIXTURE_CLOTH_T2", "ZZFIXTURE_CLOTH_T3"}

    cloth_t2 = recipes["ZZFIXTURE_CLOTH_T2"]
    assert cloth_t2.output_item_id == 900003  # resolvido via items.json
    assert cloth_t2.silver_cost == 0
    assert cloth_t2.crafting_focus == 18
    assert cloth_t2.amount_crafted == 1
    assert cloth_t2.enchantment_level == 0  # receita base
    assert cloth_t2.upgrade_resource_unique_name is None  # nada a upgradar pro nível 0

    cloth_t3 = recipes["ZZFIXTURE_CLOTH_T3"]
    assert cloth_t3.output_item_id is None  # ausente do fixture de items.json

    t2_ingredients = [i for i in ingredients if i.recipe_id == cloth_t2.id]
    assert len(t2_ingredients) == 1
    assert t2_ingredients[0].ingredient_unique_name == "ZZFIXTURE_FIBER_T2"
    assert t2_ingredients[0].ingredient_item_id == 900001
    assert t2_ingredients[0].count == 1

    t3_ingredients = {
        i.ingredient_unique_name: i for i in ingredients if i.recipe_id == cloth_t3.id
    }
    assert set(t3_ingredients.keys()) == {"ZZFIXTURE_FIBER_T3", "ZZFIXTURE_CLOTH_T2"}
    assert t3_ingredients["ZZFIXTURE_FIBER_T3"].ingredient_item_id == 900002
    assert t3_ingredients["ZZFIXTURE_FIBER_T3"].count == 2
    assert t3_ingredients["ZZFIXTURE_CLOTH_T2"].ingredient_item_id == 900003  # resolvido


async def test_import_recipes_skips_items_without_craftingrequirements(tmp_path, db_session):
    original_paths = _use_fixture_paths(tmp_path)
    try:
        await import_recipes_module.import_recipes()
    finally:
        import_recipes_module.ITEM_DUMP_PATH, import_recipes_module.ITEMS_JSON_PATH = original_paths

    result = await db_session.execute(
        select(Recipe.output_item_unique_name).where(
            Recipe.output_item_unique_name.in_(
                ["ZZFIXTURE_LOOT_ONLY", "ZZFIXTURE_MULTI_RECIPE", "ZZFIXTURE_CLOTH_T2@2"]
            )
        )
    )
    # item sem craftingrequirements, item de receita múltipla, e o
    # nível de encantamento 2 (também lista) — nenhum deve virar Recipe.
    assert result.scalars().all() == []


async def test_import_recipes_handles_enchantment_levels_and_upgrade_cost(tmp_path, db_session):
    original_paths = _use_fixture_paths(tmp_path)
    try:
        await import_recipes_module.import_recipes()
    finally:
        import_recipes_module.ITEM_DUMP_PATH, import_recipes_module.ITEMS_JSON_PATH = original_paths

    result = await db_session.execute(
        select(Recipe).where(Recipe.output_item_unique_name == "ZZFIXTURE_CLOTH_T2@1")
    )
    recipe = result.scalar_one()
    ingredients_result = await db_session.execute(
        select(RecipeIngredient).where(RecipeIngredient.recipe_id == recipe.id)
    )
    ingredients = ingredients_result.scalars().all()

    assert recipe.enchantment_level == 1
    assert (
        recipe.output_item_id == 900004
    )  # resolvido via items.json ("@1" é uma UniqueName própria)
    assert recipe.silver_cost == 0
    assert recipe.crafting_focus == 40
    assert recipe.amount_crafted == 1

    # custo de craftar já encantado: ingrediente pré-encantado (equipamento/arma)
    assert len(ingredients) == 1
    assert ingredients[0].ingredient_unique_name == "ZZFIXTURE_FIBER_T2_LEVEL1"
    assert ingredients[0].ingredient_item_id == 900005
    assert ingredients[0].enchantment_level == 1

    # custo alternativo: upgradar um item já craftado no nível anterior
    assert recipe.upgrade_resource_unique_name == "ZZFIXTURE_RUNE"
    assert recipe.upgrade_resource_count == 8
    assert (
        recipe.upgrade_resource_item_id is None
    )  # ZZFIXTURE_RUNE não está no fixture de items.json


async def test_import_recipes_twice_is_idempotent(tmp_path, db_session):
    """Task 35, achado M4: rodar 2x não pode estourar IntegrityError (UNIQUE de
    output_item_unique_name) — contagem estável, ingredientes não duplicados."""
    original_paths = _use_fixture_paths(tmp_path)
    try:
        await import_recipes_module.import_recipes()
        await import_recipes_module.import_recipes()  # não pode levantar
    finally:
        import_recipes_module.ITEM_DUMP_PATH, import_recipes_module.ITEMS_JSON_PATH = original_paths

    result = await db_session.execute(
        select(Recipe).where(Recipe.output_item_unique_name.in_(FIXTURE_NAMES))
    )
    recipes = result.scalars().all()
    recipe_ids = [r.id for r in recipes]

    ingredients_result = await db_session.execute(
        select(RecipeIngredient).where(RecipeIngredient.recipe_id.in_(recipe_ids))
    )
    ingredients = ingredients_result.scalars().all()

    by_name = {}
    for r in recipes:
        by_name.setdefault(r.output_item_unique_name, []).append(r)
    assert all(len(v) == 1 for v in by_name.values())  # nenhum nome duplicado

    cloth_t2 = by_name["ZZFIXTURE_CLOTH_T2"][0]
    t2_ingredients = [i for i in ingredients if i.recipe_id == cloth_t2.id]
    assert len(t2_ingredients) == 1  # não duplicou o ingrediente na 2ª rodada


async def test_import_recipes_reflects_updated_fixture_not_old_or_both(tmp_path, db_session):
    """Receita mudou entre execuções (ex: patch do jogo alterou o custo) — depois do 2º
    import, só a versão nova existe, não as duas."""
    original_paths = _use_fixture_paths(tmp_path)
    try:
        await import_recipes_module.import_recipes()

        updated_dump = json.loads(json.dumps(ITEM_DUMP_FIXTURE))  # cópia funda
        cloth_t2_entry = updated_dump["items"]["simpleitem"][0]
        assert cloth_t2_entry["@uniquename"] == "ZZFIXTURE_CLOTH_T2"
        cloth_t2_entry["craftingrequirements"]["@silver"] = "999"
        cloth_t2_entry["craftingrequirements"]["@craftingfocus"] = "77"

        (import_recipes_module.ITEM_DUMP_PATH).write_text(
            json.dumps(updated_dump), encoding="utf-8"
        )

        await import_recipes_module.import_recipes()
    finally:
        import_recipes_module.ITEM_DUMP_PATH, import_recipes_module.ITEMS_JSON_PATH = original_paths

    result = await db_session.execute(
        select(Recipe).where(Recipe.output_item_unique_name == "ZZFIXTURE_CLOTH_T2")
    )
    recipes = result.scalars().all()

    assert len(recipes) == 1  # não ficou com a versão antiga E a nova
    assert recipes[0].silver_cost == 999
    assert recipes[0].crafting_focus == 77
