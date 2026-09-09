"""Valor de item — a base da taxa da estação (task 4/18).

O jogo cobra a estação por **nutrição consumida**, e a nutrição sai do valor do item:
`nutrição = itemvalue × 0,1125`. O dump publica `@itemvalue` para recurso, mas **não** para arma
nem equipamento — 771 e 1.126 entradas sem o campo, o que cobre quase toda a tela de Craft.

A derivação usa a regra que o próprio dump obedece onde publica os dois lados:
**valor = Σ (valor do ingrediente × contagem)**.

O caso que este arquivo existe para travar é o **encantamento**: o valor dobra por nível, e
derivar pelo nome base cobraria a taxa do item sem encanto para todo item encantado.
"""

from decimal import Decimal
from pathlib import Path

from scripts._item_values import resolve_item_values

ITEM_DUMP_PATH = Path(__file__).resolve().parents[3] / "ITEM DUMP.json"


def _dump(**secoes) -> dict:
    return secoes


def test_valor_publicado_vence_a_derivacao():
    valores = resolve_item_values(
        _dump(
            simpleitem=[
                {"@uniquename": "T4_HIDE", "@itemvalue": "4"},
                {
                    "@uniquename": "T4_LEATHER",
                    "@itemvalue": "16",
                    "craftingrequirements": {
                        "craftresource": [{"@uniquename": "T4_HIDE", "@count": "2"}]
                    },
                },
            ]
        )
    )
    # A soma dos ingredientes daria 8; o dump diz 16. O publicado é a fonte.
    assert valores["T4_LEATHER"] == Decimal("16")


def test_deriva_da_receita_quando_o_dump_nao_publica():
    valores = resolve_item_values(
        _dump(
            simpleitem=[{"@uniquename": "T4_PLANKS", "@itemvalue": "16"}],
            weapon=[
                {
                    "@uniquename": "T4_2H_AXE",
                    "craftingrequirements": {
                        "craftresource": [{"@uniquename": "T4_PLANKS", "@count": "12"}]
                    },
                }
            ],
        )
    )
    assert valores["T4_2H_AXE"] == Decimal("192")


def test_encantado_resolve_pelo_bloco_do_NIVEL_e_nao_pelo_nome_base():
    """O defeito que motivou o arquivo.

    `T4_ARMOR@2` sem esta regra cairia na entrada base e valeria 256 — o valor de quem não tem
    encanto nenhum. O certo é 1.024, que sai do `craftingrequirements` do próprio nível, feito
    de ingrediente já encantado.
    """
    valores = resolve_item_values(
        _dump(
            simpleitem=[
                {"@uniquename": "T4_LEATHER", "@itemvalue": "16"},
                {"@uniquename": "T4_LEATHER_LEVEL2", "@itemvalue": "64"},
            ],
            equipmentitem=[
                {
                    "@uniquename": "T4_ARMOR",
                    "craftingrequirements": {
                        "craftresource": [{"@uniquename": "T4_LEATHER", "@count": "16"}]
                    },
                    "enchantments": {
                        "enchantment": [
                            {
                                "@enchantmentlevel": "2",
                                "craftingrequirements": {
                                    "craftresource": [
                                        {"@uniquename": "T4_LEATHER_LEVEL2", "@count": "16"}
                                    ]
                                },
                            }
                        ]
                    },
                }
            ],
        )
    )
    assert valores["T4_ARMOR"] == Decimal("256")
    assert valores["T4_ARMOR@2"] == Decimal("1024")


def test_recurso_refinado_encantado_le_a_entrada_do_proprio_nivel():
    """O outro padrão de nome. `T4_LEATHER_LEVEL2@2` tem entrada própria com valor publicado —
    tirar o `@2` cai em `T4_LEATHER_LEVEL2`, que **já é** o nível 2. Aqui ler direto é o certo,
    e é por isso que a regra é por entrada, não por sufixo."""
    # `names` é como o import chama: a lista autoritativa de nomes é `items.json`, não o
    # conjunto que o dump consegue enumerar sozinho.
    valores = resolve_item_values(
        _dump(simpleitem=[{"@uniquename": "T4_LEATHER_LEVEL2", "@itemvalue": "64"}]),
        names={"T4_LEATHER_LEVEL2", "T4_LEATHER_LEVEL2@2"},
    )
    assert valores["T4_LEATHER_LEVEL2"] == Decimal("64")
    assert valores["T4_LEATHER_LEVEL2@2"] == Decimal("64")


def test_ciclo_na_cadeia_nao_trava():
    valores = resolve_item_values(
        _dump(
            simpleitem=[
                {
                    "@uniquename": "A",
                    "craftingrequirements": {
                        "craftresource": [{"@uniquename": "B", "@count": "1"}]
                    },
                },
                {
                    "@uniquename": "B",
                    "craftingrequirements": {
                        "craftresource": [{"@uniquename": "A", "@count": "1"}]
                    },
                },
            ]
        )
    )
    assert "A" not in valores
    assert "B" not in valores


def test_ingrediente_sem_valor_nao_vira_zero():
    """Token de facção não tem valor em ponto nenhum da cadeia. Somar como se valesse zero
    produziria uma taxa de estação inventada; ausente é ausente (`X02`)."""
    valores = resolve_item_values(
        _dump(
            simpleitem=[
                {"@uniquename": "TOKEN"},
                {
                    "@uniquename": "TRADEPACK",
                    "craftingrequirements": {
                        "craftresource": [{"@uniquename": "TOKEN", "@count": "8"}]
                    },
                },
            ]
        )
    )
    assert "TRADEPACK" not in valores


def test_contra_o_dump_real_o_derivado_bate_com_o_publicado():
    """A regra não é postulada: ela é verificada onde o dump publica os dois lados."""
    import json

    items = json.loads(ITEM_DUMP_PATH.read_text(encoding="utf-8"))["items"]
    valores = resolve_item_values(items)

    # Refino, onde o dump publica — a derivação tem que reproduzir o número dele.
    assert valores["T8_LEATHER"] == Decimal("256")
    assert valores["T4_LEATHER_LEVEL2"] == Decimal("64")
    # Equipamento, onde o dump não publica — e o encanto multiplica.
    assert valores["T4_2H_AXE"] == Decimal("512")
    assert valores["T4_ARMOR_LEATHER_SET1"] == Decimal("256")
    assert valores["T4_ARMOR_LEATHER_SET1@2"] == Decimal("1024")
