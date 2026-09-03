"""B11: refino x fabricação vem do `@shopsubcategory1 == "refinedresources"` do ITEM DUMP.json,
não de substring (`resource`/`refin`/`material`) na categoria da loja em tempo de consulta."""

import json
from pathlib import Path

from scripts.import_recipes import prepare_recipe_import


def _write_dump(tmp_path: Path) -> tuple[Path, Path]:
    items = [
        {"UniqueName": "ZZ_WEIRD_BAR", "Index": "1"},
        {"UniqueName": "ZZ_WEIRD_ORE", "Index": "2"},
        {"UniqueName": "ZZ_MAT_SWORD", "Index": "3"},
        {"UniqueName": "ZZ_STEEL", "Index": "4"},
    ]
    dump = {
        "items": {
            "simpleitem": [
                {"@uniquename": "ZZ_WEIRD_ORE", "@tier": "4"},
                {
                    # recurso refinado — categoria da loja fora do padrão de substring, mas
                    # @shopsubcategory1 == "refinedresources"
                    "@uniquename": "ZZ_WEIRD_BAR",
                    "@tier": "4",
                    "@shopcategory": "artefacts",
                    "@shopsubcategory1": "refinedresources",
                    "craftingrequirements": {
                        "@amountcrafted": "1",
                        "craftresource": {"@uniquename": "ZZ_WEIRD_ORE", "@count": "2"},
                    },
                },
            ],
            "weapon": [
                {"@uniquename": "ZZ_STEEL", "@tier": "4"},
                {
                    # arma com "material" na subcategoria — não é refino
                    "@uniquename": "ZZ_MAT_SWORD",
                    "@tier": "4",
                    "@shopcategory": "melee",
                    "@shopsubcategory1": "swordmaterial",
                    "craftingrequirements": {
                        "@amountcrafted": "1",
                        "craftresource": {"@uniquename": "ZZ_STEEL", "@count": "8"},
                    },
                },
            ],
        }
    }
    items_path = tmp_path / "items.json"
    dump_path = tmp_path / "ITEM DUMP.json"
    items_path.write_text(json.dumps(items), encoding="utf-8")
    dump_path.write_text(json.dumps(dump), encoding="utf-8")
    return dump_path, items_path


def test_production_kind_follows_source_category_not_substrings(tmp_path):
    dump_path, items_path = _write_dump(tmp_path)
    plan = prepare_recipe_import(item_dump_path=dump_path, items_json_path=items_path)
    by_output = {r.output_item_unique_name: r.production_kind for r in plan.recipes}

    # refinedresources output with a shop category that has none of the old substrings -> refining
    assert by_output["ZZ_WEIRD_BAR"] == "refining"
    # weapon output whose subcategory literally contains "material" -> still crafting
    assert by_output["ZZ_MAT_SWORD"] == "crafting"
