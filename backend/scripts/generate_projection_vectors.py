"""Gera os vetores dourados da projeção "e se" do ranking (task 3.5/23).

Escreve ``backend/tests/fixtures/golden/projection-vectors.json`` — o **mesmo** arquivo é
consumido pelo teste de Python (``tests/opportunities/test_projection_vectors.py``) e pelo de
TypeScript (``frontend/src/lib/ranking-projection.golden.test.ts``). Trava a projeção do
cliente (`src/lib/ranking-projection.ts`) contra ``_project_row`` do servidor: se alguém mexer
num dos dois sem regerar, um dos testes quebra.

Uso: ``uv run python -m scripts.generate_projection_vectors`` (da pasta backend/).
"""

import json
from datetime import datetime
from decimal import Decimal
from pathlib import Path

from src.craft.constants import (
    DEFAULT_NON_PREMIUM_SALES_TAX_RATE,
    DEFAULT_PREMIUM_SALES_TAX_RATE,
    DEFAULT_SETUP_FEE_RATE,
)
from src.opportunities.models import RecipeRanking
from src.opportunities.ranking_service import _project_row

OUTPUT = (
    Path(__file__).resolve().parents[1]
    / "tests"
    / "fixtures"
    / "golden"
    / "projection-vectors.json"
)


def _s(value: Decimal | None) -> str | None:
    if value is None:
        return None
    if value == 0:
        return "0"
    return format(Decimal(value).normalize(), "f")


def _dt(iso: str | None) -> datetime | None:
    return datetime.fromisoformat(iso) if iso else None


_T0 = "2026-09-01T12:00:00+00:00"
_T1 = "2026-09-01T09:30:00+00:00"
_T2 = "2026-09-01T15:45:00+00:00"


def _run(components: dict, params: dict) -> dict | None:
    row = RecipeRanking(
        server_id="west",
        output_item_unique_name="T4_TEST",
        location_id="1002",
        output_quality=1,
        is_refining=True,
        recipe_silver_cost=components["recipe_silver_cost"],
        crafting_focus=components["crafting_focus"],
        executions=components["executions"],
        produced_quantity=components["produced_quantity"],
        ingredient_cost_immediate=(
            None
            if components["ingredient_cost_immediate"] is None
            else Decimal(components["ingredient_cost_immediate"])
        ),
        ingredient_cost_order=(
            None
            if components["ingredient_cost_order"] is None
            else Decimal(components["ingredient_cost_order"])
        ),
        output_gross_immediate=(
            None
            if components["output_gross_immediate"] is None
            else Decimal(components["output_gross_immediate"])
        ),
        output_gross_order=(
            None
            if components["output_gross_order"] is None
            else Decimal(components["output_gross_order"])
        ),
        ingredients_oldest_observed_at=_dt(components["ingredients_oldest_observed_at"]),
        output_immediate_observed_at=_dt(components["output_immediate_observed_at"]),
        output_order_observed_at=_dt(components["output_order_observed_at"]),
    )
    result = _project_row(
        row,
        premium=params["premium"],
        return_rate=Decimal(params["return_rate"]),
        station_cost_per_execution=Decimal(params["station_cost_per_execution"]),
        use_focus=params["use_focus"],
    )
    if result is None:
        return None
    observed = result.pop("oldest_observed_at")
    return {
        "acquisition_mode": result["acquisition_mode"],
        "sale_mode": result["sale_mode"],
        "gross_revenue": _s(result["gross_revenue"]),
        "sales_tax": _s(result["sales_tax"]),
        "sale_setup_fee": _s(result["sale_setup_fee"]),
        "net_revenue": _s(result["net_revenue"]),
        "acquisition_setup_fee": _s(result["acquisition_setup_fee"]),
        "total_fees": _s(result["total_fees"]),
        "total_cost": _s(result["total_cost"]),
        "profit": _s(result["profit"]),
        "roi": _s(result["roi"]),
        "station_cost": _s(result["station_cost"]),
        "focus_consumed": result["focus_consumed"],
        "oldest_observed_at": observed.isoformat() if observed else None,
    }


def _components(**overrides) -> dict:
    base = {
        "recipe_silver_cost": 12,
        "crafting_focus": 180,
        "executions": 4,
        "produced_quantity": 4,
        "ingredient_cost_immediate": "6000",
        "ingredient_cost_order": "5400",
        "output_gross_immediate": "10000",
        "output_gross_order": "11200",
        "ingredients_oldest_observed_at": _T1,
        "output_immediate_observed_at": _T0,
        "output_order_observed_at": _T2,
    }
    base.update(overrides)
    return base


# Matriz: premium on/off, retorno 0/15/50%, estação 0/500, foco on/off, um lado ausente.
_CASES: list[tuple[dict, dict]] = [
    (
        _components(),
        {
            "premium": True,
            "return_rate": "0",
            "station_cost_per_execution": "0",
            "use_focus": False,
        },
    ),
    (
        _components(),
        {
            "premium": False,
            "return_rate": "0",
            "station_cost_per_execution": "0",
            "use_focus": False,
        },
    ),
    (
        _components(),
        {
            "premium": True,
            "return_rate": "0.15",
            "station_cost_per_execution": "0",
            "use_focus": False,
        },
    ),
    (
        _components(),
        {
            "premium": True,
            "return_rate": "0.5",
            "station_cost_per_execution": "500",
            "use_focus": True,
        },
    ),
    (
        _components(),
        {
            "premium": False,
            "return_rate": "0.248",
            "station_cost_per_execution": "137",
            "use_focus": True,
        },
    ),
    (
        _components(ingredient_cost_order=None, output_gross_order=None),
        {
            "premium": True,
            "return_rate": "0.1",
            "station_cost_per_execution": "0",
            "use_focus": False,
        },
    ),
    (
        _components(output_gross_immediate="900", output_gross_order="900"),
        {
            "premium": False,
            "return_rate": "0",
            "station_cost_per_execution": "9000",
            "use_focus": False,
        },
    ),
    (
        _components(
            recipe_silver_cost=0,
            executions=1,
            produced_quantity=1,
            ingredient_cost_immediate="1",
            ingredient_cost_order="1",
            output_gross_immediate="100000000000000000000",
            output_gross_order="100000000000000000000",
        ),
        {
            "premium": True,
            "return_rate": "0",
            "station_cost_per_execution": "0",
            "use_focus": False,
        },
    ),
]


def build() -> dict:
    return {
        "_generated_by": "backend/scripts/generate_projection_vectors.py",
        "_source": "backend/src/opportunities/ranking_service.py::_project_row",
        "rates": {
            "premium_sales_tax": str(DEFAULT_PREMIUM_SALES_TAX_RATE),
            "non_premium_sales_tax": str(DEFAULT_NON_PREMIUM_SALES_TAX_RATE),
            "setup_fee": str(DEFAULT_SETUP_FEE_RATE),
        },
        "vectors": [
            {"components": components, "params": params, "expected": _run(components, params)}
            for components, params in _CASES
        ],
    }


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(build(), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{len(_CASES)} vetores escritos em {OUTPUT}")


if __name__ == "__main__":
    main()
