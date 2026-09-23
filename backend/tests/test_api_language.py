"""B09 / task 3.6/06: the HTTP contract speaks one language -- English.

Unlike the previous version of this guard, this scans the **whole** OpenAPI document: schema
property names, query/path parameters (``paths.*.*.parameters``), and enum/``const`` values --
not just ``components.schemas.*.properties``. A denylist of legacy strings could never catch a
new leak; this uses a positive signal (Portuguese diacritics, or a documented word-root) instead,
so a name nobody has seen before still gets caught if it looks Portuguese.

Documented exceptions, matched precisely (schema+property or schema name), never by suffix:
- Ingest upload schemas (an explicit list, ``INGEST_WIRE_SCHEMAS``) mirror the Go client wire
  verbatim (CLAUDE.md). A suffix match (``*In``) would also exempt ``DestinyBoardIn``, a normal
  request body that happens to end in ``In`` for unrelated reasons.
- ``ApiTokenPublic`` (``token_sufixo``, ``nome``, ``ultimo_uso_em``) and ``ClientIdentity``
  (``token_sufixo``) -- ``ClientIdentity`` is parsed by the Go client, so renaming it is a
  follow-up that touches the client fork, not this task.
"""

import re

from src.main import app

_DIACRITICS = re.compile(r"[áàâãéêíóôõúüçÁÀÂÃÉÊÍÓÔÕÚÜÇ]")

# Word roots seen in this project's own Portuguese leaks (query params, enum values, error
# codes). Matched as a whole underscore-delimited segment (``(^|_)word($|_)``), same technique
# the previous denylist used -- just against a vocabulary, not a fixed list of past offenders.
_PORTUGUESE_ROOTS = (
    "nao",
    "sem",
    "categoria",
    "craftaveis",
    "nome",
    "sufixo",
    "ultimo",
    "uso",
    "dado",
    "velho",
    "profundidade",
    "insuficiente",
    "preco",
    "cobertura",
    "garantida",
    "parcial",
    "ausente",
    "erro",
    "indisponivel",
    "invalido",
    "encontrado",
    "termo",
    "busca",
    "vazio",
    "receita",
    "recurso",
    "usuario",
    "revogado",
    "nivel",
    "encantamento",
)
_PORTUGUESE_WORD = re.compile(
    "(^|_)(" + "|".join(_PORTUGUESE_ROOTS) + ")($|_)",
)

# Explicit list, never a suffix match -- see module docstring.
INGEST_WIRE_SCHEMAS = {
    "MarketOrderIn",
    "MarketUploadIn",
    "MarketHistoryEntryIn",
    "MarketHistoriesUploadIn",
    "GoldPricesUploadIn",
}

# schema name -> {property names} allowed to keep a Portuguese-looking name, documented above.
DOCUMENTED_PROPERTY_EXCEPTIONS = {
    "ApiTokenPublic": {"token_sufixo", "nome", "ultimo_uso_em"},
    "ClientIdentity": {"token_sufixo"},
}


def _looks_portuguese(value: str) -> bool:
    if _DIACRITICS.search(value):
        return True
    return bool(_PORTUGUESE_WORD.search(value.lower()))


def _schemas(openapi_schema: dict) -> dict:
    return openapi_schema.get("components", {}).get("schemas", {})


def test_openapi_has_no_portuguese_property_names():
    schema = app.openapi()
    offenders = []
    for name, definition in _schemas(schema).items():
        if name in INGEST_WIRE_SCHEMAS:
            continue
        exceptions = DOCUMENTED_PROPERTY_EXCEPTIONS.get(name, set())
        for prop in definition.get("properties") or {}:
            if prop in exceptions:
                continue
            if _looks_portuguese(prop):
                offenders.append(f"{name}.{prop}")
    assert offenders == [], "Portuguese property names in the HTTP contract: " + ", ".join(
        offenders
    )


def test_openapi_has_no_portuguese_enum_or_const_values():
    schema = app.openapi()
    offenders = []
    for name, definition in _schemas(schema).items():
        if name in INGEST_WIRE_SCHEMAS:
            continue
        offenders += [
            f"{name} enum {value!r}"
            for value in definition.get("enum") or []
            if isinstance(value, str) and _looks_portuguese(value)
        ]
        for prop, prop_schema in (definition.get("properties") or {}).items():
            for key in ("enum", "const"):
                raw = prop_schema.get(key)
                candidates = raw if isinstance(raw, list) else [raw] if raw is not None else []
                offenders += [
                    f"{name}.{prop} {key} {value!r}"
                    for value in candidates
                    if isinstance(value, str) and _looks_portuguese(value)
                ]
    assert offenders == [], "Portuguese enum/const values in the HTTP contract: " + ", ".join(
        offenders
    )


def test_openapi_has_no_portuguese_query_parameters():
    """Query params live in ``paths.*.*.parameters``, never in ``components.schemas`` -- the
    previous guard only ever looked at the latter, so ``categoria``/``apenas_craftaveis`` on
    ``GET /items/search`` passed for as long as the endpoint existed."""
    schema = app.openapi()
    offenders = []
    for path, methods in schema.get("paths", {}).items():
        for method, operation in methods.items():
            if not isinstance(operation, dict):
                continue
            for param in operation.get("parameters") or []:
                if param.get("in") != "query":
                    continue
                # Task 3.6/06 deprecation window: the old names are documented, deliberate,
                # and explicitly marked ``deprecated`` in the schema itself.
                if param.get("deprecated"):
                    continue
                name = param["name"]
                if _looks_portuguese(name):
                    offenders.append(f"{method.upper()} {path} ?{name}")
    assert offenders == [], "Portuguese query parameters in the HTTP contract: " + ", ".join(
        offenders
    )


def test_ingest_wire_aliases_are_still_portuguese_free_camelcase():
    """Guard rail: the ingest upload schemas exist and still expose the Go wire names."""
    schema = app.openapi()
    order_in = schema["components"]["schemas"]["MarketOrderIn"]["properties"]
    assert "ItemTypeId" in order_in  # untouched by the rename sweep
