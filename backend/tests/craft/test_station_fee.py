"""Taxa da estação por nutrição consumida (task 4/18).

O jogo não cobra prata fixa por execução — cobra **por 100 de nutrição consumida**, e cada
receita consome uma quantidade própria, derivada do valor do item:

    nutrição = item_value × 0,1125
    taxa     = nutrição × (taxa por 100) / 100

O número de referência veio da estação aberta no jogo: taxa de uso 390 por 100 de nutrição,
refinando Couro T4.2 (`@itemvalue` 64). O jogo cobrou **28**; a nossa tela mostrava **400**.
"""

from decimal import Decimal

from src.craft.formulas import calculate_station_fee

# Couro T4.2 — `T4_LEATHER_LEVEL2` no dump.
COURO_T42 = Decimal("64")


def test_bate_com_o_numero_do_jogo():
    # 64 × 0,1125 = 7,2 de nutrição; 7,2 × 390/100 = 28,08 — o jogo mostra 28.
    assert calculate_station_fee(COURO_T42, Decimal("390"), 1) == Decimal("28.08")


def test_escala_com_as_execucoes():
    assert calculate_station_fee(COURO_T42, Decimal("390"), 100) == Decimal("2808.00")


def test_o_valor_do_item_manda_no_tamanho_da_taxa():
    """O erro do modelo antigo não era de calibração: ele **trocava de sinal**. Prata fixa
    cobrava 56× demais num recurso T4 e 9× de menos numa arma T8."""
    couro_t4 = calculate_station_fee(Decimal("16"), Decimal("400"), 1)
    machado_t8 = calculate_station_fee(Decimal("8192"), Decimal("400"), 1)

    assert couro_t4 == Decimal("7.2000")
    assert machado_t8 == Decimal("3686.4000")
    # Um único número fixo (400) não pode estar certo nos dois.
    assert couro_t4 < Decimal("400") < machado_t8


def test_sem_valor_de_item_a_taxa_e_zero_e_nao_um_numero_inventado():
    """538 receitas — os trade packs de facção — são feitas de tokens sem valor em ponto nenhum
    da cadeia. São `QUESTITEM`, não vendáveis, então já aparecem sem preço de venda; cobrar uma
    taxa arbitrária ali seria inventar custo para uma linha que ninguém consegue vender."""
    assert calculate_station_fee(None, Decimal("390"), 10) == Decimal("0")


def test_estacao_gratis_nao_cobra():
    assert calculate_station_fee(COURO_T42, Decimal("0"), 100) == Decimal("0")


def test_sem_execucao_nao_cobra():
    assert calculate_station_fee(COURO_T42, Decimal("390"), 0) == Decimal("0")
