"""
Sem banco — testa só a inferência pura de `kind` a partir do formato do `location_id`.
Formatos medidos no jogo real: docs/03-contrato-ingest-real.md secao 4.
"""

from src.items.service import infer_location_kind


def test_numeric_location_is_city():
    assert infer_location_kind("1002") == "city"


def test_suffixed_location_is_hell_den():
    assert infer_location_kind("1000-HellDen") == "hell_den"


def test_at_sign_location_is_rest():
    assert infer_location_kind("3005@1") == "rest"


def test_unknown_format_does_not_raise():
    assert infer_location_kind("ALGO_TOTALMENTE_INESPERADO") == "desconhecido"
