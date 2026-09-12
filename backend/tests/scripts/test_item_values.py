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
    """Uma receita que depende de si mesma não tem valor para derivar — e o que importa aqui é a
    recursão terminar. Sem valor em ponto nenhum da cadeia, o jogo conta zero (task 4/13)."""
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
    assert valores.get("A", Decimal("0")) == Decimal("0")
    assert valores.get("B", Decimal("0")) == Decimal("0")


def test_ingrediente_sem_valor_conta_zero_como_na_estacao_do_jogo():
    """Task 4/13 (achado `W10`). A task 18 deixava a poção sem valor quando um ingrediente não
    tinha — "ausente é ausente" — e a taxa da estação entrava como **zero** em 153 das 172 poções.

    Medido na estação: o jogo soma os ingredientes que têm valor e conta o resto como zero. A
    Poção de Fúria T4 são 16 bardanas a 40 e uma presa de lobisomem sem valor: 640, e a 320 por
    100 de nutrição a estação cobra 230 (640 × 0,1125 × 3,2 = 230,4)."""
    valores = resolve_item_values(
        _dump(
            simpleitem=[
                {"@uniquename": "PRESA"},
                {"@uniquename": "BARDANA", "@itemvalue": "40"},
            ],
            consumableitem=[
                {
                    "@uniquename": "FURIA",
                    "craftingrequirements": {
                        "craftresource": [
                            {"@uniquename": "PRESA", "@count": "1"},
                            {"@uniquename": "BARDANA", "@count": "16"},
                        ]
                    },
                }
            ],
        )
    )
    assert valores["FURIA"] == Decimal("640")
    # O item cru sem valor e sem receita continua ausente: não há o que somar.
    assert "PRESA" not in valores


def test_receita_que_resolve_inteira_continua_vencendo():
    """A regra do zero só vale quando nenhuma receita resolve. Item que já tinha valor não muda —
    ou todo equipamento com rota alternativa trocaria de taxa sem medida nenhuma."""
    valores = resolve_item_values(
        _dump(
            simpleitem=[
                {"@uniquename": "SEM_VALOR"},
                {"@uniquename": "BARDANA", "@itemvalue": "40"},
                {
                    "@uniquename": "DUAS_ROTAS",
                    "craftingrequirements": [
                        {
                            "craftresource": [
                                {"@uniquename": "SEM_VALOR", "@count": "1"},
                                {"@uniquename": "BARDANA", "@count": "1"},
                            ]
                        },
                        {"craftresource": [{"@uniquename": "BARDANA", "@count": "3"}]},
                    ],
                },
            ]
        )
    )
    assert valores["DUAS_ROTAS"] == Decimal("120")


def test_contra_a_estacao_do_jogo_as_duas_pocoes_medidas():
    """Os dois números lidos na estação do alquimista (2026-09-12, taxa 320 por 100 de nutrição):
    Poção de Cura T4.1 custou 432 de prata e Poção de Fúria T4, 230. Custo = valor × 0,36."""
    import json

    items = json.loads(ITEM_DUMP_PATH.read_text(encoding="utf-8"))["items"]
    valores = resolve_item_values(
        items, names={"T4_POTION_HEAL@1", "T4_POTION_BERSERK", "T6_POTION_HEAL"}
    )

    # 24 bardanas e 6 ovos a 40; o extrato arcano (15) não tem valor e conta zero.
    assert valores["T4_POTION_HEAL@1"] == Decimal("1200")
    # 16 bardanas a 40; a presa de lobisomem conta zero.
    assert valores["T4_POTION_BERSERK"] == Decimal("640")
    # Poção sem ingrediente sem valor já resolvia antes — e não pode mudar.
    assert valores["T6_POTION_HEAL"] == Decimal("4320")


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
