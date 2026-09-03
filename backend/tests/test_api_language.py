"""B09: the HTTP contract of prices/demand/recipes/catalog speaks one language — English.

Exceptions, all documented:
- ingest upload schemas (``*In``) mirror the Go client wire verbatim (CLAUDE.md).
- ``ApiTokenPublic`` (``token_sufixo``, ``nome``, ``ultimo_uso_em``) — its twin ``ClientIdentity``
  is parsed by the Go client, so the rename is a follow-up (``W1`` of task 07).
"""

import re

from src.main import app

# Portuguese terms that used to leak into /items/*/prices, /demand and recipe/catalog schemas.
FORBIDDEN = (
    "venda",
    "compra",
    "vendido",
    "melhor_preco",
    "unidades_observadas",
    "ordens_observadas",
    "observado_em",
    "idade_segundos",
    "cobertura",
    "janela_frescor",
    "serie_6h",
    "preco_medio",
    "ultimas_24h",
    "ultimos_7d",
    "ultimos_30d",
    "tem_receita",
    "variantes_encantadas",
    "inicio",
)

EXEMPT_SCHEMAS = {"ApiTokenPublic"}


def _iter_property_names(schema: dict):
    for name, definition in schema.get("components", {}).get("schemas", {}).items():
        if name.endswith("In") or name in EXEMPT_SCHEMAS:  # ingest wire + documented exceptions
            continue
        for prop in definition.get("properties") or {}:
            yield name, prop


def test_openapi_has_no_portuguese_field_names_outside_the_exceptions():
    schema = app.openapi()
    offenders = [
        f"{model}.{prop}"
        for model, prop in _iter_property_names(schema)
        for term in FORBIDDEN
        if re.search(rf"(^|_){re.escape(term)}($|_)", prop)
    ]
    assert offenders == [], "Portuguese field names in the HTTP contract: " + ", ".join(offenders)


def test_ingest_wire_aliases_are_still_portuguese_free_camelcase():
    """Guard rail: the ingest upload schemas exist and still expose the Go wire names."""
    schema = app.openapi()
    order_in = schema["components"]["schemas"]["MarketOrderIn"]["properties"]
    assert "ItemTypeId" in order_in  # untouched by the rename sweep
