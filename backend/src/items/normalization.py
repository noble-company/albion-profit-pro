"""Normalização v1 da busca de itens.

Esta função é parte do contrato persistido: importer, consulta e migration de backfill precisam
produzir exatamente o mesmo texto. Se a regra mudar, crie uma nova revisão em vez de alterar esta
função silenciosamente; a revisão também precisa invalidar o manifesto do dataset estático.
"""

import unicodedata

SEARCH_NORMALIZATION_REVISION = "item-search-v1"


def normalize_item_search(*values: str | None) -> str:
    combined = " ".join(value.strip() for value in values if value and value.strip())
    decomposed = unicodedata.normalize("NFKD", combined.casefold())
    without_marks = "".join(char for char in decomposed if not unicodedata.combining(char))
    return " ".join(without_marks.split())
