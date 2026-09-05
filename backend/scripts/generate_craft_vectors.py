"""Gera os vetores dourados de craft a partir do motor Python (task 3.5/18, F09).

Escreve ``backend/tests/fixtures/golden/craft-vectors.json`` — o **mesmo** arquivo é
consumido pelo teste de Python (``tests/craft/test_golden_vectors.py``) e pelo teste de
TypeScript (``frontend/src/lib/craft-formulas.golden.test.ts``). Se alguém mudar
``craft/formulas.py`` (ou uma taxa) sem rodar este script, o teste de Python quebra; o teste
de TS quebra se o porte divergir dos vetores regerados.

Uso: ``uv run python -m scripts.generate_craft_vectors`` (da pasta backend/).
"""

import json
from decimal import Decimal
from pathlib import Path

from src.craft import formulas
from src.craft.constants import (
    DEFAULT_NON_PREMIUM_SALES_TAX_RATE,
    DEFAULT_PREMIUM_SALES_TAX_RATE,
    DEFAULT_SETUP_FEE_RATE,
    AcquisitionMode,
    SaleMode,
)

OUTPUT = (
    Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "golden" / "craft-vectors.json"
)

_ACQ = {"immediate": AcquisitionMode.IMMEDIATE, "buy_order": AcquisitionMode.BUY_ORDER}
_SALE = {"immediate": SaleMode.IMMEDIATE, "sell_order": SaleMode.SELL_ORDER}


def _s(value: Decimal | None) -> str | None:
    """Serialização canônica de um Decimal — sem zero à direita, sem notação exponencial.

    O lado TypeScript (`decimal.js`, `.toString()`) produz exatamente esta forma; assim os
    dois lados comparam string a string.
    """
    if value is None:
        return None
    if value == 0:
        return "0"
    return format(value.normalize(), "f")


def _run(fn: str, args: dict):
    if fn == "ceil_decimal":
        return formulas.ceil_decimal(Decimal(args["value"]))
    if fn == "round_down_for_display":
        return _s(
            formulas.round_down_for_display(Decimal(args["value"]), args.get("decimal_places", 1))
        )
    if fn == "calculate_production":
        p = formulas.calculate_production(args["desired_quantity"], args["amount_crafted"])
        return {
            "executions": p.executions,
            "produced_quantity": p.produced_quantity,
            "surplus_quantity": p.surplus_quantity,
        }
    if fn == "calculate_ingredient_requirement":
        r = formulas.calculate_ingredient_requirement(
            args["count_per_execution"],
            args["executions"],
            Decimal(args["return_rate"]),
            return_eligible=args.get("return_eligible", True),
        )
        return {
            "gross_quantity": r.gross_quantity,
            "expected_return_quantity": _s(r.expected_return_quantity),
            "effective_quantity": _s(r.effective_quantity),
            "purchase_quantity": r.purchase_quantity,
        }
    if fn == "calculate_focus_consumed":
        return formulas.calculate_focus_consumed(
            args["crafting_focus"], args["executions"], use_focus=args["use_focus"]
        )
    if fn == "calculate_percentage_charge":
        return _s(
            formulas.calculate_percentage_charge(Decimal(args["base"]), Decimal(args["rate"]))
        )
    if fn == "calculate_acquisition_cost":
        c = formulas.calculate_acquisition_cost(
            Decimal(args["quoted_cost"]),
            _ACQ[args["mode"]],
            Decimal(args["setup_fee_rate"]),
        )
        return {
            "quoted_cost": _s(c.quoted_cost),
            "setup_fee": _s(c.setup_fee),
            "total_cost": _s(c.total_cost),
        }
    if fn == "calculate_sale_revenue":
        r = formulas.calculate_sale_revenue(
            Decimal(args["gross_revenue"]),
            _SALE[args["mode"]],
            Decimal(args["sales_tax_rate"]),
            Decimal(args["setup_fee_rate"]),
        )
        return {
            "gross_revenue": _s(r.gross_revenue),
            "setup_fee": _s(r.setup_fee),
            "sales_tax": _s(r.sales_tax),
            "net_revenue": _s(r.net_revenue),
        }
    if fn == "calculate_financial_result":
        r = formulas.calculate_financial_result(
            Decimal(args["total_cost"]),
            Decimal(args["net_revenue"]),
            args["produced_quantity"],
        )
        return {
            "profit": _s(r.profit),
            "profit_per_unit": _s(r.profit_per_unit),
            "roi": _s(r.roi),
        }
    raise ValueError(f"função desconhecida: {fn}")


_SETUP = str(DEFAULT_SETUP_FEE_RATE)
_PREMIUM_TAX = str(DEFAULT_PREMIUM_SALES_TAX_RATE)
_NON_PREMIUM_TAX = str(DEFAULT_NON_PREMIUM_SALES_TAX_RATE)

# Matriz de casos: taxas nos extremos, base zero, base gigante (acima de 2^53), retorno,
# foco, produção com sobra, ROI nulo, custo zero, bordas de arredondamento.
_CASES: list[tuple[str, dict]] = [
    # --- cobrança percentual: cada uma arredonda pra cima isoladamente ---
    ("calculate_percentage_charge", {"base": "0", "rate": _PREMIUM_TAX}),
    ("calculate_percentage_charge", {"base": "1500", "rate": _PREMIUM_TAX}),
    ("calculate_percentage_charge", {"base": "1501", "rate": _PREMIUM_TAX}),  # 60.04 -> 61
    ("calculate_percentage_charge", {"base": "25", "rate": _SETUP}),  # 0.625 -> 1
    ("calculate_percentage_charge", {"base": "1", "rate": "1"}),
    ("calculate_percentage_charge", {"base": "1", "rate": "0"}),
    ("calculate_percentage_charge", {"base": "99999999999999999999", "rate": _SETUP}),
    ("calculate_percentage_charge", {"base": "123456789012345678", "rate": _NON_PREMIUM_TAX}),
    # --- ceil / display ---
    ("ceil_decimal", {"value": "0"}),
    ("ceil_decimal", {"value": "7.0001"}),
    ("ceil_decimal", {"value": "7"}),
    ("round_down_for_display", {"value": "2.525"}),
    ("round_down_for_display", {"value": "-2.525"}),
    ("round_down_for_display", {"value": "10.5", "decimal_places": 1}),
    # --- produção com sobra ---
    ("calculate_production", {"desired_quantity": 11, "amount_crafted": 5}),
    ("calculate_production", {"desired_quantity": 10, "amount_crafted": 5}),
    ("calculate_production", {"desired_quantity": 1, "amount_crafted": 1}),
    # --- retorno de ingrediente ---
    (
        "calculate_ingredient_requirement",
        {"count_per_execution": 3, "executions": 3, "return_rate": "0.15"},
    ),
    (
        "calculate_ingredient_requirement",
        {"count_per_execution": 1, "executions": 10, "return_rate": "0.15"},
    ),
    (
        "calculate_ingredient_requirement",
        {"count_per_execution": 2, "executions": 5, "return_rate": "0"},
    ),
    (
        "calculate_ingredient_requirement",
        {"count_per_execution": 2, "executions": 5, "return_rate": "1"},
    ),
    (
        "calculate_ingredient_requirement",
        {
            "count_per_execution": 4,
            "executions": 7,
            "return_rate": "0.40",
            "return_eligible": False,
        },
    ),
    # --- foco ---
    ("calculate_focus_consumed", {"crafting_focus": 18, "executions": 10, "use_focus": True}),
    ("calculate_focus_consumed", {"crafting_focus": 18, "executions": 10, "use_focus": False}),
    # --- aquisição ---
    (
        "calculate_acquisition_cost",
        {"quoted_cost": "810", "mode": "immediate", "setup_fee_rate": _SETUP},
    ),
    (
        "calculate_acquisition_cost",
        {"quoted_cost": "810", "mode": "buy_order", "setup_fee_rate": _SETUP},
    ),
    (
        "calculate_acquisition_cost",
        {"quoted_cost": "0", "mode": "buy_order", "setup_fee_rate": _SETUP},
    ),
    (
        "calculate_acquisition_cost",
        {"quoted_cost": "50000000000000000000", "mode": "buy_order", "setup_fee_rate": _SETUP},
    ),
    # --- venda (imposto sempre, setup só em sell order; premium só muda o default do imposto) ---
    (
        "calculate_sale_revenue",
        {
            "gross_revenue": "1500",
            "mode": "immediate",
            "sales_tax_rate": _PREMIUM_TAX,
            "setup_fee_rate": _SETUP,
        },
    ),
    (
        "calculate_sale_revenue",
        {
            "gross_revenue": "1500",
            "mode": "sell_order",
            "sales_tax_rate": _PREMIUM_TAX,
            "setup_fee_rate": _SETUP,
        },
    ),
    (
        "calculate_sale_revenue",
        {
            "gross_revenue": "101",
            "mode": "immediate",
            "sales_tax_rate": _NON_PREMIUM_TAX,
            "setup_fee_rate": _SETUP,
        },
    ),
    (
        "calculate_sale_revenue",
        {
            "gross_revenue": "0",
            "mode": "sell_order",
            "sales_tax_rate": _PREMIUM_TAX,
            "setup_fee_rate": _SETUP,
        },
    ),
    # --- resultado financeiro: ROI razão, null com custo zero, divisão não-exata ---
    (
        "calculate_financial_result",
        {"total_cost": "80", "net_revenue": "100", "produced_quantity": 4},
    ),
    (
        "calculate_financial_result",
        {"total_cost": "0", "net_revenue": "100", "produced_quantity": 5},
    ),
    (
        "calculate_financial_result",
        {"total_cost": "240", "net_revenue": "320", "produced_quantity": 3},
    ),
    (
        "calculate_financial_result",
        {"total_cost": "1000000", "net_revenue": "999999", "produced_quantity": 7},
    ),
    (
        "calculate_financial_result",
        {
            "total_cost": "12345678901234567890",
            "net_revenue": "12345678901234567891",
            "produced_quantity": 1,
        },
    ),
]


def build() -> dict:
    return {
        "_generated_by": "backend/scripts/generate_craft_vectors.py",
        "_source": "backend/src/craft/formulas.py",
        "rates": {
            "premium_sales_tax": _PREMIUM_TAX,
            "non_premium_sales_tax": _NON_PREMIUM_TAX,
            "setup_fee": _SETUP,
        },
        "vectors": [{"fn": fn, "args": args, "expected": _run(fn, args)} for fn, args in _CASES],
    }


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(build(), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{len(_CASES)} vetores escritos em {OUTPUT}")


if __name__ == "__main__":
    main()
