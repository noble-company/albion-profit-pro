"""Carregamento e parse compartilhados dos dois JSONs estáticos de origem — reaproveitados por
`scripts/import_recipes.py` e `scripts/import_items.py`, que liam e normalizavam os mesmos
dois arquivos de formas quase idênticas.

`items.json` é a lista plana de todos os itens do jogo, com o `Index` numérico que o
client/mercado usa. `ITEM DUMP.json` é o `items.xml` oficial (via `ao-bin-dumps`)
convertido de XML pra JSON — atributos XML viram chaves `@algumacoisa`, categorizado por
`items.<categoria>` (`simpleitem`, `equipmentitem`, ...). A chave de junção entre os dois é
o nome em texto (`items.json["UniqueName"]` ↔ `ITEM DUMP.json["@uniquename"]`) — não há
campo numérico em comum. Ver docs/02-dados-de-receita.md.
"""

import json
from pathlib import Path

RELEVANT_CATEGORIES = ["simpleitem", "equipmentitem", "weapon", "consumableitem"]


def as_list(value):
    """Vários blocos do dump vêm como objeto único OU array dependendo de quantos itens
    existem (ex: craftresource, enchantment, upgraderesource) — normaliza pra sempre
    iterar uma lista."""
    if value is None:
        return []
    return value if isinstance(value, list) else [value]


def _read_json(path: Path):
    if not path.exists():
        raise FileNotFoundError(
            f"Arquivo não encontrado: {path} (configure via env var ITEM_DUMP_PATH/"
            f"ITEMS_JSON_PATH se não estiver na raiz do repositório)"
        )
    return json.loads(path.read_text(encoding="utf-8"))


def load_items_json(path: Path) -> list[dict]:
    return _read_json(path)


def load_item_dump_items(path: Path) -> dict:
    """Devolve só o bloco `items` (categorizado), não o dump inteiro."""
    return _read_json(path)["items"]


def iter_category_entries(items: dict, categories: list[str] = RELEVANT_CATEGORIES):
    """Itera as entradas de todas as categorias relevantes de uma vez — mesmo padrão que
    `import_recipes.py`/`import_items.py` repetiam cada um por conta própria."""
    for category in categories:
        yield from as_list(items.get(category, []))
