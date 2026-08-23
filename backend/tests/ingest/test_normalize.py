"""
Sem banco — testa só as conversões puras. Ver docs/03-contrato-ingest-real.md pros valores
reais medidos (achados N1, N4) que justificam cada caso de teste.
"""

from datetime import datetime, timezone
from decimal import Decimal

from src.ingest.normalize import (
    SILVER_SCALE,
    datetime_from_expires,
    datetime_from_ticks,
    silver_from_wire,
)


def test_silver_from_wire_divides_by_scale():
    assert silver_from_wire(370000) == Decimal("37")


def test_datetime_from_ticks_matches_real_capture():
    result = datetime_from_ticks(639229968000000000)
    assert result == datetime(2026, 8, 22, 12, 0, 0, tzinfo=timezone.utc)


def test_datetime_from_expires_accepts_variable_precision():
    assert datetime_from_expires("2026-09-21T06:39:47.636097") == datetime(
        2026, 9, 21, 6, 39, 47, 636097, tzinfo=timezone.utc
    )
    assert datetime_from_expires("2026-09-21T06:39:47.6360") == datetime(
        2026, 9, 21, 6, 39, 47, 636000, tzinfo=timezone.utc
    )
    assert datetime_from_expires("2026-09-21T06:39:47") == datetime(
        2026, 9, 21, 6, 39, 47, tzinfo=timezone.utc
    )


def test_real_history_fixture_silver_amounts_are_all_multiples_of_scale(payload_historico_real):
    """Se um dia isso deixar de ser verdade, a premissa do achado N1 quebrou e queremos saber
    (ver docs/03-contrato-ingest-real.md secao 1)."""
    amounts = [h["SilverAmount"] for h in payload_historico_real["MarketHistories"]]
    assert amounts  # a fixture não pode estar vazia, senão o teste não prova nada
    assert all(a % SILVER_SCALE == 0 for a in amounts)
