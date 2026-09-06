"""Task 3.5/23: os vetores dourados da projeção "e se" travam ``_project_row`` (servidor) e
``src/lib/ranking-projection.ts`` (cliente) na mesma conta.

- ``test_every_vector_matches_a_fresh_call``: se ``_project_row`` mudar de comportamento, os
  ``expected`` congelados param de bater.
- ``test_committed_file_is_up_to_date``: mudar uma taxa ou a matriz sem rodar o gerador deixa
  o arquivo committado obsoleto — e o frontend rodaria contra vetores velhos.

O teste de TypeScript (``frontend/src/lib/ranking-projection.golden.test.ts``) consome o
**mesmo** arquivo.
"""

import json

from scripts.generate_projection_vectors import OUTPUT, _run, build


def test_every_vector_matches_a_fresh_call() -> None:
    data = json.loads(OUTPUT.read_text(encoding="utf-8"))
    assert len(data["vectors"]) >= 6
    for vector in data["vectors"]:
        got = _run(vector["components"], vector["params"])
        assert got == vector["expected"], (vector["components"], vector["params"])


def test_committed_file_is_up_to_date() -> None:
    committed = OUTPUT.read_text(encoding="utf-8")
    regenerated = json.dumps(build(), indent=2, ensure_ascii=False) + "\n"
    assert committed == regenerated, (
        "projection-vectors.json está obsoleto — rode "
        "`uv run python -m scripts.generate_projection_vectors`"
    )


def test_rates_recorded_match_the_constants() -> None:
    from src.craft.constants import (
        DEFAULT_NON_PREMIUM_SALES_TAX_RATE,
        DEFAULT_PREMIUM_SALES_TAX_RATE,
        DEFAULT_SETUP_FEE_RATE,
    )

    data = json.loads(OUTPUT.read_text(encoding="utf-8"))
    assert data["rates"] == {
        "premium_sales_tax": str(DEFAULT_PREMIUM_SALES_TAX_RATE),
        "non_premium_sales_tax": str(DEFAULT_NON_PREMIUM_SALES_TAX_RATE),
        "setup_fee": str(DEFAULT_SETUP_FEE_RATE),
    }
