"""Invocação canônica: `uv run python -m scripts.import_items` (de dentro de `backend/`).
Mesmo motivo de scripts/import_recipes.py (ver docstring de lá) — `python
scripts/import_items.py` direto falha com `ModuleNotFoundError: No module named 'src'`.

Já é idempotente por construção (upsert via `ON CONFLICT DO UPDATE` em `unique_name`, task
28) — a task 35 só corrigiu os caminhos hardcoded relativos ao CWD (mesmo problema de
`import_recipes.py`) e trocou os `print` por log estruturado.
"""

import asyncio
import os
from pathlib import Path

import structlog
from sqlalchemy.dialects.postgresql import insert as pg_insert

from scripts._dumps import iter_category_entries, load_item_dump_items, load_items_json
from src.database import async_session_maker
from src.items.models import Item
from src.logging_config import configure_logging

configure_logging()
log = structlog.get_logger()

RAIZ_PROJETO = Path(__file__).resolve().parents[2]  # backend/scripts/x.py -> raiz do repo
ITEMS_JSON_PATH = Path(os.getenv("ITEMS_JSON_PATH", RAIZ_PROJETO / "items.json"))
ITEM_DUMP_PATH = Path(os.getenv("ITEM_DUMP_PATH", RAIZ_PROJETO / "ITEM DUMP.json"))

# Postgres recusa mais de 65.535 parâmetros num único INSERT — com ~12k itens x 8 colunas
# isso estoura de longe, então o import roda em lotes.
CHUNK_SIZE = 2000

# Item.unique_name é String(64) — mesmo limite de MarketOrder.item_id e
# Recipe.output_item_unique_name em todo o resto do schema. Medido no items.json real: 9 de
# 12071 UniqueName excedem isso (até 74 chars), todos tokens cosméticos de skin de montaria
# "UNTRADEABLE" — nunca aparecem em marketorders/markethistories.ingest por definição, então
# são pulados em vez de forçar um alargamento de coluna que não ajudaria em nada.
MAX_UNIQUE_NAME_LENGTH = 64


def _base_name(unique_name: str) -> str:
    """Variantes encantadas ("X@1") não têm entrada própria no ITEM DUMP.json — a
    classificação (tier/categoria) mora na entrada base."""
    return unique_name.split("@", 1)[0]


def _enchantment_level(unique_name: str) -> int:
    if "@" not in unique_name:
        return 0
    return int(unique_name.rsplit("@", 1)[1])


def load_dump_metadata(dump_path: Path) -> dict[str, dict]:
    items = load_item_dump_items(dump_path)
    metadata = {}
    for entry in iter_category_entries(items):
        unique_name = entry.get("@uniquename")
        if unique_name is None:
            continue
        tier = entry.get("@tier")
        metadata[unique_name] = {
            "tier": int(tier) if tier is not None else None,
            "shop_category": entry.get("@shopcategory"),
            "shop_subcategory": entry.get("@shopsubcategory1"),
        }
    return metadata


def build_items(
    items_json_path: Path, dump_metadata: dict[str, dict], skipped_too_long: list[str]
) -> list[dict]:
    data = load_items_json(items_json_path)
    rows = []
    for entry in data:
        unique_name = entry.get("UniqueName")
        if unique_name is None:
            continue
        if len(unique_name) > MAX_UNIQUE_NAME_LENGTH:
            skipped_too_long.append(unique_name)
            continue
        index = entry.get("Index")
        localized_names = entry.get("LocalizedNames") or {}
        meta = dump_metadata.get(_base_name(unique_name), {})
        rows.append(
            {
                "unique_name": unique_name,
                "albion_id": int(index) if index is not None else None,
                "name_pt": localized_names.get("PT-BR"),
                "name_en": localized_names.get("EN-US"),
                "tier": meta.get("tier"),
                "enchantment_level": _enchantment_level(unique_name),
                "shop_category": meta.get("shop_category"),
                "shop_subcategory": meta.get("shop_subcategory"),
            }
        )
    return rows


async def import_items() -> None:
    dump_metadata = load_dump_metadata(ITEM_DUMP_PATH)
    skipped_too_long: list[str] = []
    rows = build_items(ITEMS_JSON_PATH, dump_metadata, skipped_too_long)

    async with async_session_maker() as session:
        for i in range(0, len(rows), CHUNK_SIZE):
            chunk = rows[i : i + CHUNK_SIZE]
            stmt = pg_insert(Item).values(chunk)
            stmt = stmt.on_conflict_do_update(
                index_elements=["unique_name"],
                set_={
                    "albion_id": stmt.excluded.albion_id,
                    "name_pt": stmt.excluded.name_pt,
                    "name_en": stmt.excluded.name_en,
                    "tier": stmt.excluded.tier,
                    "enchantment_level": stmt.excluded.enchantment_level,
                    "shop_category": stmt.excluded.shop_category,
                    "shop_subcategory": stmt.excluded.shop_subcategory,
                },
            )
            await session.execute(stmt)
        await session.commit()

    log.info(
        "import_items.concluido",
        itens_processados=len(rows),
        pulados_nome_longo=len(skipped_too_long),
        pulados_nome_longo_amostra=skipped_too_long[:20],
    )


if __name__ == "__main__":
    asyncio.run(import_items())
