"""Ordenação server-side dos rankings de oportunidade (``F08``).

O valor de ``sort`` é validado como ``Literal`` no router e **nunca** interpolado em SQL:
aqui ele só indexa um mapa de colunas SQLAlchemy. O desempate estável garante uma ordem
total — percorrer as páginas não repete nem pula linha, mesmo com valores empatados.
"""

SORT_FIELDS: tuple[str, ...] = ("profit", "roi", "freshness")
SORT_DIRECTIONS: tuple[str, ...] = ("asc", "desc")


def apply_order(column_map: dict, tiebreakers: list, sort: str, direction: str) -> list:
    primary = column_map[sort]
    primary = primary.asc() if direction == "asc" else primary.desc()
    return [primary.nulls_last(), *tiebreakers]
