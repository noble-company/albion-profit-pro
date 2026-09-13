"""Task 4/26 — quem retorna no retorno de recurso vem do dump.

O `ITEM DUMP.json` marca o ingrediente que o jogo **não** devolve com `@maxreturnamount="0"`:
artefato, cristal, token, capa base, livro. Sem importar a marca, cliente e servidor aplicavam o
retorno à receita inteira — 600 receitas a 36,7% compravam 600 artefatos para 947 execuções.
"""

import json
from pathlib import Path

from scripts.import_recipes import prepare_recipe_import


def _write_dump(tmp_path: Path) -> tuple[Path, Path]:
    items = [
        {"UniqueName": nome, "Index": str(indice)}
        for indice, nome in enumerate(
            [
                "ZZ_STAFF",
                "ZZ_STAFF@1",
                "ZZ_PLANKS",
                "ZZ_PLANKS_LEVEL1@1",
                "ZZ_ARTEFACT",
                "ZZ_CLOTH",
                "ZZ_FIBER",
            ],
            start=1,
        )
    ]
    dump = {
        "items": {
            "simpleitem": [
                {"@uniquename": "ZZ_FIBER", "@tier": "4"},
                {
                    # Refino: nenhum ingrediente leva a marca — tudo retorna.
                    "@uniquename": "ZZ_CLOTH",
                    "@tier": "4",
                    "@shopcategory": "crafting",
                    "@shopsubcategory1": "refinedresources",
                    "craftingrequirements": {
                        "@amountcrafted": "1",
                        "craftresource": {"@uniquename": "ZZ_FIBER", "@count": "2"},
                    },
                },
            ],
            "weapon": [
                {
                    "@uniquename": "ZZ_STAFF",
                    "@tier": "4",
                    "@shopcategory": "weapons",
                    "@shopsubcategory1": "arcanestaff",
                    "craftingrequirements": {
                        "@amountcrafted": "1",
                        "craftresource": [
                            {"@uniquename": "ZZ_PLANKS", "@count": "20"},
                            {"@uniquename": "ZZ_ARTEFACT", "@count": "1", "@maxreturnamount": "0"},
                        ],
                    },
                    "enchantments": {
                        "enchantment": [
                            {
                                "@enchantmentlevel": "1",
                                "craftingrequirements": {
                                    "@amountcrafted": "1",
                                    "craftresource": [
                                        {
                                            "@uniquename": "ZZ_PLANKS_LEVEL1",
                                            "@count": "20",
                                            "@enchantmentlevel": "1",
                                        },
                                        {
                                            "@uniquename": "ZZ_ARTEFACT",
                                            "@count": "1",
                                            "@maxreturnamount": "0",
                                        },
                                    ],
                                },
                            }
                        ]
                    },
                }
            ],
        }
    }
    items_path = tmp_path / "items.json"
    dump_path = tmp_path / "ITEM DUMP.json"
    items_path.write_text(json.dumps(items), encoding="utf-8")
    dump_path.write_text(json.dumps(dump), encoding="utf-8")
    return dump_path, items_path


def _por_saida(tmp_path: Path) -> dict[str, list[tuple[str, bool]]]:
    dump_path, items_path = _write_dump(tmp_path)
    plan = prepare_recipe_import(item_dump_path=dump_path, items_json_path=items_path)
    return {
        receita.output_item_unique_name: [
            (ingrediente.ingredient_unique_name, ingrediente.return_eligible)
            for ingrediente in receita.ingredients
        ]
        for receita in plan.recipes
    }


def test_ingrediente_marcado_no_dump_nao_retorna(tmp_path):
    assert _por_saida(tmp_path)["ZZ_STAFF"] == [("ZZ_PLANKS", True), ("ZZ_ARTEFACT", False)]


def test_a_marca_vale_tambem_no_nivel_encantado(tmp_path):
    assert _por_saida(tmp_path)["ZZ_STAFF@1"] == [
        ("ZZ_PLANKS_LEVEL1@1", True),
        ("ZZ_ARTEFACT", False),
    ]


def test_sem_a_marca_o_ingrediente_retorna(tmp_path):
    """Explícito, e não o padrão da coluna: o `default` do SQLAlchemy só entra no flush, e o
    plano de import é lido antes dele."""
    assert _por_saida(tmp_path)["ZZ_CLOTH"] == [("ZZ_FIBER", True)]
