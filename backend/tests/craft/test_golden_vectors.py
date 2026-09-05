"""F09 / task 3.5/18: os vetores dourados travam o motor de dinheiro dos dois lados.

- ``test_every_vector_matches_a_fresh_python_call``: se ``craft/formulas.py`` mudar de
  comportamento, os ``expected`` congelados param de bater — força regerar.
- ``test_committed_file_is_up_to_date``: se alguém mudar uma taxa (``craft/constants.py``) ou
  a matriz de casos sem rodar o gerador, o arquivo committado difere do regerado. É isso que
  impede o frontend de rodar contra vetores obsoletos.

O teste de TypeScript (``frontend/src/lib/craft-formulas.golden.test.ts``) consome o **mesmo**
arquivo.
"""

import json

from scripts.generate_craft_vectors import OUTPUT, _run, build


def test_every_vector_matches_a_fresh_python_call() -> None:
    data = json.loads(OUTPUT.read_text(encoding="utf-8"))
    assert len(data["vectors"]) > 20
    for vector in data["vectors"]:
        got = _run(vector["fn"], vector["args"])
        assert got == vector["expected"], (vector["fn"], vector["args"])


def test_committed_file_is_up_to_date() -> None:
    committed = OUTPUT.read_text(encoding="utf-8")
    regenerated = json.dumps(build(), indent=2, ensure_ascii=False) + "\n"
    assert committed == regenerated, (
        "craft-vectors.json está obsoleto — rode `uv run python -m scripts.generate_craft_vectors`"
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
