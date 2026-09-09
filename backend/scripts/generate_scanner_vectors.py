"""Gera os vetores dourados do scanner (task 4/06).

Escreve ``backend/tests/fixtures/golden/scanner-vectors.json`` — o **mesmo** arquivo é consumido
pelo teste de Python (``tests/craft/test_scanner_vectors.py``) e pelo de TypeScript
(``frontend/src/scanner/engine.golden.test.ts``).

## O que está travado aqui, e como

O motor do cliente (``frontend/src/scanner/engine.ts``) e o do servidor calculam a mesma coisa
por caminhos diferentes. A paridade é provada em duas pontas, e a transitividade fecha:

1. ``compose_scenarios`` abaixo compõe as fórmulas de ``src/craft/formulas.py`` na mesma ordem
   que ``craft/service.py::_build_scenario``. ``tests/craft/test_scanner_vectors.py`` prova que
   os dois dão o mesmo número **rodando o ``simulate_craft`` de verdade** contra um livro
   semeado com profundidade sobrando (para o caminhamento de livro ser um no-op).
2. O teste de TypeScript prova que ``computeScanner`` bate string a string com o ``expected``
   destes vetores.

Logo: cliente == composição == ``simulate_craft``.

## O que NÃO está travado, de propósito

O scanner é uma estimativa de **topo de livro**. Quando a profundidade do melhor nível não
cobre a quantidade, ``simulate_craft`` caminha o livro e paga mais caro — e aí os dois números
divergem **por construção**, não por bug. Por isso os vetores usam livro profundo: eles travam
a aritmética, não a política de profundidade.

Uso: ``uv run python -m scripts.generate_scanner_vectors`` (da pasta backend/).
"""

import json
from decimal import Decimal
from pathlib import Path

from src.craft.constants import (
    DEFAULT_NON_PREMIUM_SALES_TAX_RATE,
    DEFAULT_PREMIUM_SALES_TAX_RATE,
    DEFAULT_SETUP_FEE_RATE,
    AcquisitionMode,
    SaleMode,
)
from src.craft.formulas import (
    calculate_acquisition_cost,
    calculate_financial_result,
    calculate_focus_consumed,
    calculate_ingredient_requirement,
    calculate_production,
    calculate_sale_revenue,
)

OUTPUT = (
    Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "golden" / "scanner-vectors.json"
)


def _s(value: Decimal | None) -> str | None:
    if value is None:
        return None
    if value == 0:
        return "0"
    return format(Decimal(value).normalize(), "f")


def compose_scenarios(recipe: dict, prices: dict, params: dict) -> dict | None:
    """Compõe os 4 cenários e devolve o mais lucrativo — o que o cliente faz.

    Segue `_build_scenario` na ordem que importa: a taxa de montagem é
    ``ceil(total_do_ingrediente × taxa)`` cobrada **por ingrediente** e só depois somada.
    Somar antes de arredondar dá outro número (dois ingredientes de 100 dão 6, não 5) — foi a
    divergência real que esta task encontrou no motor do cliente.
    """
    production = calculate_production(params["quantity"], recipe["amount_crafted"])
    focus_consumed = calculate_focus_consumed(
        recipe["crafting_focus"], production.executions, use_focus=params["use_focus"]
    )
    recipe_silver = Decimal(recipe["silver_cost"]) * production.executions
    station_total = Decimal(params["station_cost_per_execution"]) * production.executions
    sales_tax_rate = (
        DEFAULT_PREMIUM_SALES_TAX_RATE if params["premium"] else DEFAULT_NON_PREMIUM_SALES_TAX_RATE
    )
    return_rate = Decimal(params["return_rate"])

    def _price(item: str, side: str, quality: int, enchantment: int) -> Decimal | None:
        raw = prices.get(f"{item}|{params['location']}|{quality}|{enchantment}", {}).get(side)
        return None if raw is None else Decimal(raw)

    # Saída: vender imediato entrega para o maior `buy`; ordem de venda anuncia no `sell`.
    # O nível vem da COLUNA da receita, como `craft/service.py:180-184` faz — não do sufixo
    # `@N` do nome, que seria uma segunda fonte de verdade.
    output_enchantment = recipe["enchantment_level"]
    sale_options: list[tuple[SaleMode, Decimal | None]] = [
        (
            SaleMode.IMMEDIATE,
            _price(recipe["output_item"], "buy", params["output_quality"], output_enchantment),
        ),
        (
            SaleMode.SELL_ORDER,
            _price(recipe["output_item"], "sell", params["output_quality"], output_enchantment),
        ),
    ]
    if all(price is None for _, price in sale_options):
        return None

    # Ingredientes: comprar imediato pega o `sell`; ordem de compra entra no `buy`.
    immediate_totals: list[Decimal] = []
    order_totals: list[Decimal] = []
    immediate_ok = order_ok = True
    for ingredient in recipe["ingredients"]:
        requirement = calculate_ingredient_requirement(
            ingredient["count"], production.executions, return_rate
        )
        immediate = _price(ingredient["item"], "sell", 1, ingredient["enchantment_level"])
        order = _price(ingredient["item"], "buy", 1, ingredient["enchantment_level"])
        if immediate is None:
            immediate_ok = False
        else:
            immediate_totals.append(immediate * requirement.purchase_quantity)
        if order is None:
            order_ok = False
        else:
            order_totals.append(order * requirement.purchase_quantity)

    acquisition_options: list[tuple[AcquisitionMode, list[Decimal] | None]] = [
        (AcquisitionMode.IMMEDIATE, immediate_totals if immediate_ok else None),
        (AcquisitionMode.BUY_ORDER, order_totals if order_ok else None),
    ]
    if all(totals is None for _, totals in acquisition_options):
        return None

    best: dict | None = None
    for acquisition_mode, totals in acquisition_options:
        if totals is None:
            continue
        parts = [
            calculate_acquisition_cost(total, acquisition_mode, DEFAULT_SETUP_FEE_RATE)
            for total in totals
        ]
        ingredient_cost = sum((p.quoted_cost for p in parts), start=Decimal("0"))
        acquisition_setup_fee = sum((p.setup_fee for p in parts), start=Decimal("0"))
        total_cost = ingredient_cost + acquisition_setup_fee + recipe_silver + station_total

        for sale_mode, unit_price in sale_options:
            if unit_price is None:
                continue
            gross_revenue = unit_price * production.produced_quantity
            sale = calculate_sale_revenue(
                gross_revenue, sale_mode, sales_tax_rate, DEFAULT_SETUP_FEE_RATE
            )
            result = calculate_financial_result(
                total_cost, sale.net_revenue, production.produced_quantity
            )
            if best is not None and result.profit <= best["_profit"]:
                continue

            weight = recipe.get("output_weight")
            total_weight = (
                None if weight is None else Decimal(weight) * production.produced_quantity
            )
            best = {
                "_profit": result.profit,
                "state": "priced",
                "acquisition_mode": acquisition_mode.value,
                "sale_mode": sale_mode.value,
                "total_cost": _s(total_cost),
                "gross_revenue": _s(sale.gross_revenue),
                "sales_tax": _s(sale.sales_tax),
                "total_fees": _s(sale.sales_tax + sale.setup_fee + acquisition_setup_fee),
                "net_revenue": _s(sale.net_revenue),
                "profit": _s(result.profit),
                "roi": _s(
                    None
                    if total_cost == 0
                    else (result.profit / total_cost * 100).quantize(Decimal("0.0001"))
                ),
                "profit_per_weight": _s(None if not total_weight else result.profit / total_weight),
                "profit_per_focus": _s(
                    None if focus_consumed == 0 else result.profit / focus_consumed
                ),
                "executions": production.executions,
                "produced_quantity": production.produced_quantity,
                "focus_consumed": focus_consumed,
            }

    if best is not None:
        best.pop("_profit")
    return best


_REFINO = {
    "output_item": "T4_CLOTH",
    "production_kind": "refining",
    "enchantment_level": 0,
    "silver_cost": 0,
    "crafting_focus": 100,
    "amount_crafted": 1,
    "output_weight": "0.51",
    "ingredients": [
        {"item": "T4_FIBER", "count": 2, "enchantment_level": 0},
        {"item": "T3_CLOTH", "count": 1, "enchantment_level": 0},
    ],
}

_CRAFT_MULTIPLO = {
    "output_item": "T5_PLANKS",
    "production_kind": "refining",
    "enchantment_level": 0,
    "silver_cost": 37,
    "crafting_focus": 78,
    "amount_crafted": 5,  # exercita produced_quantity != executions
    "output_weight": "0.76",
    "ingredients": [
        {"item": "T5_WOOD", "count": 3, "enchantment_level": 0},
        {"item": "T4_PLANKS", "count": 1, "enchantment_level": 0},
    ],
}

_ENCANTADO = {
    "output_item": "T6_CLOTH@2",
    "production_kind": "refining",
    "enchantment_level": 2,
    "silver_cost": 120,
    "crafting_focus": 320,
    "amount_crafted": 1,
    "output_weight": "1.14",
    "ingredients": [
        {"item": "T6_FIBER", "count": 2, "enchantment_level": 2},
        {"item": "T5_CLOTH", "count": 1, "enchantment_level": 2},
    ],
}


def _prices(entries: dict[str, tuple[str | None, str | None]], location="1002") -> dict:
    out = {}
    for key, (sell, buy) in entries.items():
        item, quality, ench = key.split(":")
        out[f"{item}|{location}|{quality}|{ench}"] = {"sell": sell, "buy": buy}
    return out


_CASES: list[tuple[dict, dict, dict]] = [
    # 1. Só um cenário possível (imediato/imediato) — a conta mais simples.
    (
        _REFINO,
        _prices(
            {
                "T4_FIBER:1:0": ("100", None),
                "T3_CLOTH:1:0": ("200", None),
                "T4_CLOTH:1:0": (None, "1000"),
            }
        ),
        {
            "premium": True,
            "return_rate": "0",
            "station_cost_per_execution": "0",
            "use_focus": False,
            "output_quality": 1,
            "quantity": 1,
            "location": "1002",
        },
    ),
    # 2. Quatro cenários; a taxa por ingrediente decide o vencedor.
    (
        _REFINO,
        _prices(
            {
                "T4_FIBER:1:0": ("100", "90"),
                "T3_CLOTH:1:0": ("200", "180"),
                "T4_CLOTH:1:0": ("1100", "1000"),
            }
        ),
        {
            "premium": True,
            "return_rate": "0",
            "station_cost_per_execution": "0",
            "use_focus": False,
            "output_quality": 1,
            "quantity": 1,
            "location": "1002",
        },
    ),
    # 3. Sem premium: imposto dobra.
    (
        _REFINO,
        _prices(
            {
                "T4_FIBER:1:0": ("100", "90"),
                "T3_CLOTH:1:0": ("200", "180"),
                "T4_CLOTH:1:0": ("1100", "1000"),
            }
        ),
        {
            "premium": False,
            "return_rate": "0",
            "station_cost_per_execution": "0",
            "use_focus": True,
            "output_quality": 1,
            "quantity": 1,
            "location": "1002",
        },
    ),
    # 4. Retorno de refino com bônus de cidade — o `36,7` da task 3.6/01, com fração feia.
    (
        _REFINO,
        _prices(
            {
                "T4_FIBER:1:0": ("137", "121"),
                "T3_CLOTH:1:0": ("419", "377"),
                "T4_CLOTH:1:0": ("1187", "1049"),
            }
        ),
        {
            "premium": True,
            "return_rate": "0.367",
            "station_cost_per_execution": "137",
            "use_focus": True,
            "output_quality": 1,
            "quantity": 1,
            "location": "1002",
        },
    ),
    # 5. amount_crafted=5 e quantidade 7 — força executions=2 e sobra.
    (
        _CRAFT_MULTIPLO,
        _prices(
            {
                "T5_WOOD:1:0": ("311", "289"),
                "T4_PLANKS:1:0": ("173", "151"),
                "T5_PLANKS:1:0": ("866", "790"),
            }
        ),
        {
            "premium": True,
            "return_rate": "0.248",
            "station_cost_per_execution": "53",
            "use_focus": True,
            "output_quality": 1,
            "quantity": 7,
            "location": "1002",
        },
    ),
    # 6. Encantado, qualidade 3, valores grandes.
    (
        _ENCANTADO,
        _prices(
            {
                "T6_FIBER:1:2": ("5472", "4933"),
                "T5_CLOTH:1:2": ("2149", "1912"),
                "T6_CLOTH@2:3:2": ("18785", "17452"),
            }
        ),
        {
            "premium": False,
            "return_rate": "0.088",
            "station_cost_per_execution": "1200",
            "use_focus": True,
            "output_quality": 3,
            "quantity": 3,
            "location": "1002",
        },
    ),
    # 7. Prejuízo: lucro e ROI negativos precisam bater igual.
    (
        _REFINO,
        _prices(
            {
                "T4_FIBER:1:0": ("900", None),
                "T3_CLOTH:1:0": ("900", None),
                "T4_CLOTH:1:0": (None, "100"),
            }
        ),
        {
            "premium": False,
            "return_rate": "0",
            "station_cost_per_execution": "500",
            "use_focus": False,
            "output_quality": 1,
            "quantity": 1,
            "location": "1002",
        },
    ),
    # 8. Sem preço de ingrediente: a linha existe, sem números.
    (
        _REFINO,
        _prices({"T4_FIBER:1:0": ("100", None), "T4_CLOTH:1:0": (None, "1000")}),
        {
            "premium": True,
            "return_rate": "0",
            "station_cost_per_execution": "0",
            "use_focus": False,
            "output_quality": 1,
            "quantity": 1,
            "location": "1002",
        },
    ),
]


def build() -> dict:
    return {
        "_generated_by": "backend/scripts/generate_scanner_vectors.py",
        "_source": "backend/src/craft/formulas.py, composto como craft/service.py::_build_scenario",
        "_parity": (
            "tests/craft/test_scanner_vectors.py prova que esta composicao == simulate_craft "
            "sobre livro com profundidade sobrando; o teste TS prova que computeScanner == este "
            "arquivo. Transitivamente, cliente == servidor."
        ),
        "rates": {
            "premium_sales_tax": str(DEFAULT_PREMIUM_SALES_TAX_RATE),
            "non_premium_sales_tax": str(DEFAULT_NON_PREMIUM_SALES_TAX_RATE),
            "setup_fee": str(DEFAULT_SETUP_FEE_RATE),
        },
        "vectors": [
            {
                "recipe": recipe,
                "prices": prices,
                "params": params,
                "expected": compose_scenarios(recipe, prices, params),
            }
            for recipe, prices, params in _CASES
        ],
    }


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(build(), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{len(_CASES)} vetores escritos em {OUTPUT}")


if __name__ == "__main__":
    main()
