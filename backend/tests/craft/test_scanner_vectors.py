"""Task 4/06 — paridade do motor do scanner.

A prova é transitiva e depende deste arquivo no meio:

    computeScanner (TS)  ==  compose_scenarios (aqui)  ==  simulate_craft (servidor)
    └── frontend/src/scanner/engine.golden.test.ts ──┘   └── test_composicao_bate_com_simulate_craft

Sem o segundo elo, os vetores só provariam que o cliente concorda com um script — e o script
poderia estar errado junto. `test_composicao_bate_com_simulate_craft` fecha o circuito rodando o
`simulate_craft` **de verdade**.

O livro é semeado com profundidade sobrando de propósito: aí o caminhamento de livro do
`simulate_craft` vira um no-op e sobra exatamente a aritmética que o scanner reproduz. Onde a
profundidade não cobre, os dois divergem **por construção** — o scanner é topo de livro, e é a
diferença que o "Analisar" existe para mostrar.
"""

import json
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest

from scripts.generate_scanner_vectors import OUTPUT, build, compose_scenarios
from src.craft.schemas import CraftSimulationRequest
from src.craft.service import simulate_craft
from src.items.models import Item
from src.prices.models import MarketOrder
from src.recipes.models import Recipe, RecipeIngredient

AGORA = datetime.now(UTC)
# Fundo generoso: o objetivo é que o melhor nível cubra a quantidade inteira, para o
# caminhamento de livro não entrar em cena.
PROFUNDIDADE = 10_000


def test_vetores_conferem_com_uma_chamada_nova() -> None:
    dados = json.loads(OUTPUT.read_text(encoding="utf-8"))
    assert len(dados["vectors"]) >= 8
    for vetor in dados["vectors"]:
        recomputado = compose_scenarios(vetor["recipe"], vetor["prices"], vetor["params"])
        assert recomputado == vetor["expected"], vetor["params"]


def test_arquivo_committado_esta_atualizado() -> None:
    committed = OUTPUT.read_text(encoding="utf-8")
    assert committed == json.dumps(build(), indent=2, ensure_ascii=False) + "\n", (
        "scanner-vectors.json obsoleto — rode `uv run python -m scripts.generate_scanner_vectors`"
    )


def _item(unique_name: str, weight: str | None = None, item_value: str | None = None) -> Item:
    _, sep, suffix = unique_name.rpartition("@")
    return Item(
        unique_name=unique_name,
        name_pt=unique_name,
        name_en=unique_name,
        tier=4,
        enchantment_level=int(suffix) if sep else 0,
        weight=Decimal(weight) if weight else None,
        item_value=Decimal(item_value) if item_value else None,
        busca_normalizada=unique_name.casefold(),
    )


def _ordem(item: str, location: str, price: str, side: str, quality: int, ench: int) -> MarketOrder:
    return MarketOrder(
        server_id="west",
        source_id=uuid.uuid4().int % 10_000_000,
        item_id=item,
        group_type_id=item,
        location_id=location,
        quality_level=quality,
        enchantment_level=ench,
        unit_price_silver=Decimal(price),
        amount=PROFUNDIDADE,
        auction_type=side,
        expires=AGORA + timedelta(days=7),
        last_seen_at=AGORA,
    )


@pytest.mark.parametrize("indice", range(len(build()["vectors"])))
async def test_composicao_bate_com_simulate_craft(db_session, indice: int) -> None:
    """O elo que sustenta os vetores: a composição do script tem que ser o `simulate_craft`."""
    dados = build()
    vetor = dados["vectors"][indice]
    if vetor["expected"] is None:
        pytest.skip("vetor sem preço — não há cenário para o simulate_craft comparar")

    receita_dados, precos, params = vetor["recipe"], vetor["prices"], vetor["params"]

    # --- catálogo ---
    nomes = {receita_dados["output_item"]} | {i["item"] for i in receita_dados["ingredients"]}
    # `item_value` só na SAÍDA: é dela que sai a nutrição consumida, e é o que faz a taxa da
    # estação do `simulate_craft` bater com a do script (task 4/18).
    db_session.add_all(
        [
            _item(
                nome,
                receita_dados.get("output_weight"),
                receita_dados.get("item_value") if nome == receita_dados["output_item"] else None,
            )
            for nome in sorted(nomes)
        ]
    )

    receita = Recipe(
        output_item_unique_name=receita_dados["output_item"],
        production_kind=receita_dados["production_kind"],
        enchantment_level=receita_dados["enchantment_level"],
        silver_cost=receita_dados["silver_cost"],
        crafting_focus=receita_dados["crafting_focus"],
        amount_crafted=receita_dados["amount_crafted"],
        craft_time=Decimal("0.1"),
    )
    for posicao, ingrediente in enumerate(receita_dados["ingredients"]):
        receita.ingredients.append(
            RecipeIngredient(
                ingredient_unique_name=ingrediente["item"],
                count=ingrediente["count"],
                enchantment_level=ingrediente["enchantment_level"],
                position=posicao,
                # O `simulate_craft` tem que tirar a elegibilidade da receita (task 4/26), sem
                # o pedido dizer nada — é o que o vetor 9, com artefato, prova.
                return_eligible=ingrediente.get("return_eligible", True),
            )
        )
    db_session.add(receita)

    # --- livro, com profundidade sobrando ---
    for chave, lados in precos.items():
        item, location, quality, ench = chave.split("|")
        if lados.get("sell"):
            db_session.add(_ordem(item, location, lados["sell"], "offer", int(quality), int(ench)))
        if lados.get("buy"):
            db_session.add(_ordem(item, location, lados["buy"], "request", int(quality), int(ench)))
    await db_session.commit()

    resultado = await simulate_craft(
        db_session,
        CraftSimulationRequest(
            server="west",
            output_item=receita_dados["output_item"],
            location_id=params["location"],
            quantity=params["quantity"],
            output_quality=params["output_quality"],
            scope="all",
            return_rate=Decimal(params["return_rate"]),
            station_fee_per_100_nutrition=Decimal(params["station_fee_per_100_nutrition"]),
            use_focus=params["use_focus"],
            premium=params["premium"],
        ),
        uuid.uuid4(),
    )

    esperado = vetor["expected"]
    cenario = next(
        c
        for c in resultado["scenarios"]
        if c["acquisition_mode"].value == esperado["acquisition_mode"]
        and c["sale_mode"].value == esperado["sale_mode"]
    )

    # O `simulate_craft` devolve os 4 cenários; a composição escolhe o melhor. Comparamos o
    # cenário correspondente, número a número.
    assert _n(cenario["costs"]["total_cost"]) == _n(esperado["total_cost"])
    assert _n(cenario["revenue"]["gross_revenue"]) == _n(esperado["gross_revenue"])
    assert _n(cenario["revenue"]["sales_tax"]) == _n(esperado["sales_tax"])
    assert _n(cenario["revenue"]["net_revenue"]) == _n(esperado["net_revenue"])
    assert _n(cenario["profit"]) == _n(esperado["profit"])

    # E o cenário escolhido tem que ser mesmo o mais lucrativo entre os quatro.
    melhor = max(
        (c for c in resultado["scenarios"] if c["profit"] is not None),
        key=lambda c: c["profit"],
    )
    assert melhor["profit"] == cenario["profit"]


def _n(valor: str | Decimal | None) -> str | None:
    """Compara valor, não representação.

    Os vetores guardam `format(x.normalize(), 'f')` (`"400"`); o `simulate_craft` devolve o
    Decimal cru do `Numeric(18,4)` (`Decimal("400.0000")`). São o mesmo número — a diferença de
    escala não é divergência de cálculo, e travar nela só geraria ruído.
    """
    if valor is None:
        return None
    decimal = Decimal(valor)
    return "0" if decimal == 0 else format(decimal.normalize(), "f")
