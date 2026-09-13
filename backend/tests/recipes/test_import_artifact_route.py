"""Task 4/27 — equipamento de facção entra no catálogo pela receita do artefato.

O dump dá duas receitas para cada arma, peça e mão secundária de artefato de facção: uma com o
artefato do item, outra que troca o artefato por um token de favor. O catálogo guarda uma receita
por item, e o importador pulava a lista inteira — 560 itens base e 2.240 níveis encantados fora da
tela. O Arco Badônico do Mestre (T6) não existia em `/craft`.

Os outros casos de várias receitas não são essa troca (peça Royal a partir de três sets, peixe
picado, transmutação de recurso bruto) e continuam fora.
"""

import json
from pathlib import Path

from scripts.import_recipes import prepare_recipe_import

ARTEFATO = "T6_ARTEFACT_2H_BOW_KEEPER"
FAVOR = "T6_ARTEFACT_TOKEN_FAVOR_3"


def _rotas(tabuas: str, nivel: int | None = None) -> list[dict]:
    madeira = {"@uniquename": tabuas, "@count": "32"}
    if nivel is not None:
        madeira["@enchantmentlevel"] = str(nivel)
    return [
        {
            "@silver": "0",
            "@craftingfocus": "5252",
            "craftresource": [
                madeira,
                {"@uniquename": ARTEFATO, "@count": "1", "@maxreturnamount": "0"},
            ],
        },
        {
            "@craftingfocus": "5252",
            "craftresource": [
                madeira,
                {"@uniquename": FAVOR, "@count": "1", "@maxreturnamount": "0"},
            ],
        },
    ]


def _write_dump(tmp_path: Path) -> tuple[Path, Path]:
    nomes = [
        "T6_2H_BOW_KEEPER",
        "T6_2H_BOW_KEEPER@1",
        "T6_PLANKS",
        "T6_PLANKS_LEVEL1@1",
        ARTEFATO,
        FAVOR,
        "T4_HEAD_CLOTH_ROYAL",
        "T4_HEAD_CLOTH_SET1",
        "T4_HEAD_CLOTH_SET2",
        "T4_HEAD_CLOTH_SET3",
        "QUESTITEM_TOKEN_ROYAL_T4",
    ]
    items = [{"UniqueName": nome, "Index": str(i)} for i, nome in enumerate(nomes, start=1)]
    dump = {
        "items": {
            "weapon": [
                {
                    "@uniquename": "T6_2H_BOW_KEEPER",
                    "@tier": "6",
                    "@shopcategory": "weapons",
                    "@shopsubcategory1": "bow",
                    "craftingrequirements": _rotas("T6_PLANKS"),
                    "enchantments": {
                        "enchantment": [
                            {
                                "@enchantmentlevel": "1",
                                "craftingrequirements": _rotas("T6_PLANKS_LEVEL1", nivel=1),
                            }
                        ]
                    },
                }
            ],
            "equipmentitem": [
                {
                    # Peça Royal: três receitas, uma por set trocado. Não é artefato × favor.
                    "@uniquename": "T4_HEAD_CLOTH_ROYAL",
                    "@tier": "4",
                    "@shopcategory": "head",
                    "@shopsubcategory1": "cloth_helmet",
                    "craftingrequirements": [
                        {
                            "craftresource": [
                                {
                                    "@uniquename": f"T4_HEAD_CLOTH_SET{n}",
                                    "@count": "1",
                                    "@maxreturnamount": "0",
                                },
                                {
                                    "@uniquename": "QUESTITEM_TOKEN_ROYAL_T4",
                                    "@count": "2",
                                    "@maxreturnamount": "0",
                                },
                            ]
                        }
                        for n in (1, 2, 3)
                    ],
                }
            ],
        }
    }
    items_path = tmp_path / "items.json"
    dump_path = tmp_path / "ITEM DUMP.json"
    items_path.write_text(json.dumps(items), encoding="utf-8")
    dump_path.write_text(json.dumps(dump), encoding="utf-8")
    return dump_path, items_path


def _plano(tmp_path: Path):
    dump_path, items_path = _write_dump(tmp_path)
    return prepare_recipe_import(item_dump_path=dump_path, items_json_path=items_path)


def _ingredientes(plano, saida: str) -> list[tuple[str, bool]]:
    receita = next(r for r in plano.recipes if r.output_item_unique_name == saida)
    return [(i.ingredient_unique_name, i.return_eligible) for i in receita.ingredients]


def test_arma_de_faccao_entra_pela_receita_do_artefato(tmp_path):
    plano = _plano(tmp_path)

    assert _ingredientes(plano, "T6_2H_BOW_KEEPER") == [("T6_PLANKS", True), (ARTEFATO, False)]
    assert "T6_2H_BOW_KEEPER" not in plano.skipped_multi_recipe


def test_o_nivel_encantado_tambem_entra_pela_receita_do_artefato(tmp_path):
    plano = _plano(tmp_path)

    assert _ingredientes(plano, "T6_2H_BOW_KEEPER@1") == [
        ("T6_PLANKS_LEVEL1@1", True),
        (ARTEFATO, False),
    ]


def test_peca_royal_continua_fora(tmp_path):
    """Três receitas, cada uma a partir de um set diferente. Escolher uma daria um custo que
    depende da peça que o jogador tem — não é a troca de artefato por favor."""
    plano = _plano(tmp_path)

    assert "T4_HEAD_CLOTH_ROYAL" in plano.skipped_multi_recipe
    assert all(r.output_item_unique_name != "T4_HEAD_CLOTH_ROYAL" for r in plano.recipes)
