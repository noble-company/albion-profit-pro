"""
Task 36, item 4 — testes de contrato contra os payloads reais capturados do jogo
(tests/fixtures/wire/), não dicts inventados. Existem porque os achados N1 (prata x10.000),
N2 (Timescale não é identidade) e N3 (LocationId não numérico) passaram pelos 51 testes da
suíte antiga sem ninguém notar — o dict inventado "parecia" certo. Ver
docs/03-contrato-ingest-real.md.
"""

from copy import deepcopy

from src.ingest.normalize import SILVER_SCALE, datetime_from_expires
from src.ingest.schemas import MarketHistoriesUploadIn, MarketUploadIn


def test_marketorders_fixture_validates_against_schema(payload_ordens_real):
    original = deepcopy(payload_ordens_real)
    upload = MarketUploadIn.model_validate(payload_ordens_real)
    assert len(upload.orders) == len(payload_ordens_real["Orders"])
    assert payload_ordens_real == original


def test_markethistories_fixture_validates_against_schema(payload_historico_real):
    original = deepcopy(payload_historico_real)
    upload = MarketHistoriesUploadIn.model_validate(payload_historico_real)
    assert len(upload.histories) == len(payload_historico_real["MarketHistories"])
    assert payload_historico_real == original


def test_marketorders_fixture_unit_price_silver_is_multiple_of_scale(payload_ordens_real):
    """Achado N1: se um patch do jogo passar a mandar prata sem o fator x10.000, esse teste
    avisa em vez de deixar o preço sair errado por 4 ordens de grandeza em silêncio."""
    prices = [o["UnitPriceSilver"] for o in payload_ordens_real["Orders"]]
    assert prices  # a fixture não pode estar vazia, senão o teste não prova nada
    assert all(p % SILVER_SCALE == 0 for p in prices)


def test_markethistories_fixture_timescale_is_within_known_range(payload_historico_real):
    """Achado N2: só {0, 1, 2} têm bucket_seconds mapeado (BUCKET_POR_TIMESCALE) — um
    Timescale novo precisa de uma decisão explícita, não um KeyError em produção."""
    assert payload_historico_real["Timescale"] in {0, 1, 2}


def test_marketorders_fixture_expires_is_parseable(payload_ordens_real):
    """Achado da seção 5 do contrato: o client corta zeros à direita da fração de segundo —
    confirma que toda variação de precisão presente na captura real ainda é parseável."""
    for order in payload_ordens_real["Orders"]:
        datetime_from_expires(order["Expires"])  # não pode levantar
