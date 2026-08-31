"""
Roda o import de verdade (`import_items()`) contra um recorte pequeno de JSON de teste —
não os arquivos reais (12k+ itens / 17MB) — monkeypatchando os caminhos de arquivo do
módulo. Mesmo padrão de tests/recipes/test_import_recipes.py.
"""

import json

from sqlalchemy import select

import scripts.import_items as import_items_module
from src.items.models import Item

UNIQUE_NAMES = ["ZZFIBER_T2", "ZZFIBER_T2@1", "ZZNODUMP"]

# Medido no items.json real: 9 UniqueName excedem 64 chars (tokens cosméticos "UNTRADEABLE"
# de skin de montaria, até 74 chars) — o import estourava StringDataRightTruncationError
# antes desse caso ser tratado. 65 chars de propósito (1 acima do limite).
TOO_LONG_UNIQUE_NAME = "ZZ_" + "A" * 62

ITEM_DUMP_FIXTURE = {
    "items": {
        "simpleitem": [
            {
                "@uniquename": "ZZFIBER_T2",
                "@tier": "2",
                "@shopcategory": "crafting",
                "@shopsubcategory1": "resources",
            }
        ]
    }
}

# ZZNODUMP deliberadamente ausente do ITEM_DUMP_FIXTURE — testa o caminho "sem
# correspondência no dump" (tier/categoria ficam None, sem quebrar o import).
ITEMS_JSON_FIXTURE = [
    {
        "UniqueName": "ZZFIBER_T2",
        "Index": "900001",
        "LocalizedNames": {"EN-US": "Cotton", "PT-BR": "Algodão"},
    },
    {
        "UniqueName": "ZZFIBER_T2@1",
        "Index": "900002",
        "LocalizedNames": {"EN-US": "Cotton (1)", "PT-BR": "Algodão (1)"},
    },
    {"UniqueName": "ZZNODUMP", "Index": "900003"},
    {"UniqueName": TOO_LONG_UNIQUE_NAME, "Index": "900004"},
]


def _use_fixture_paths(tmp_path):
    item_dump_path = tmp_path / "ITEM DUMP.json"
    items_json_path = tmp_path / "items.json"
    item_dump_path.write_text(json.dumps(ITEM_DUMP_FIXTURE), encoding="utf-8")
    items_json_path.write_text(json.dumps(ITEMS_JSON_FIXTURE), encoding="utf-8")

    original_item_dump_path = import_items_module.ITEM_DUMP_PATH
    original_items_json_path = import_items_module.ITEMS_JSON_PATH
    import_items_module.ITEM_DUMP_PATH = item_dump_path
    import_items_module.ITEMS_JSON_PATH = items_json_path
    return original_item_dump_path, original_items_json_path


async def test_import_items_resolves_index_and_dump_metadata(tmp_path, db_session):
    original_paths = _use_fixture_paths(tmp_path)
    try:
        await import_items_module.import_items()
    finally:
        import_items_module.ITEM_DUMP_PATH, import_items_module.ITEMS_JSON_PATH = original_paths

    result = await db_session.execute(select(Item).where(Item.unique_name.in_(UNIQUE_NAMES)))
    items = {i.unique_name: i for i in result.scalars().all()}

    assert set(items.keys()) == set(UNIQUE_NAMES)

    base = items["ZZFIBER_T2"]
    assert base.albion_id == 900001
    assert base.name_pt == "Algodão"
    assert base.name_en == "Cotton"
    assert base.enchantment_level == 0
    assert base.tier == 2
    assert base.shop_category == "crafting"
    assert base.shop_subcategory == "resources"
    assert base.busca_normalizada == "zzfiber_t2 algodao cotton"

    enchanted = items["ZZFIBER_T2@1"]
    assert enchanted.albion_id == 900002
    assert enchanted.enchantment_level == 1
    # variantes encantadas não têm entrada própria no dump — herdam a classificação
    # da entrada base (mesmo @uniquename sem o sufixo "@N").
    assert enchanted.tier == 2
    assert enchanted.shop_category == "crafting"

    no_dump = items["ZZNODUMP"]
    assert no_dump.albion_id == 900003
    assert no_dump.tier is None
    assert no_dump.shop_category is None


async def test_import_items_skips_unique_names_over_column_limit(tmp_path, db_session):
    """StringDataRightTruncationError real, medido rodando contra o items.json de verdade:
    9 tokens cosméticos "UNTRADEABLE" de skin de montaria excedem os 64 chars de
    Item.unique_name. Nunca aparecem no mercado (intransferíveis), então são pulados em vez
    de travar o import inteiro."""
    original_paths = _use_fixture_paths(tmp_path)
    try:
        await import_items_module.import_items()  # não pode levantar
    finally:
        import_items_module.ITEM_DUMP_PATH, import_items_module.ITEMS_JSON_PATH = original_paths

    result = await db_session.execute(select(Item).where(Item.unique_name == TOO_LONG_UNIQUE_NAME))
    assert result.scalar_one_or_none() is None  # pulado, não truncado nem gravado

    # os itens válidos do mesmo lote continuam importados normalmente
    other = await db_session.execute(select(Item).where(Item.unique_name == "ZZFIBER_T2"))
    assert other.scalar_one_or_none() is not None


async def test_import_items_is_idempotent(tmp_path, db_session):
    original_paths = _use_fixture_paths(tmp_path)
    try:
        await import_items_module.import_items()
        await import_items_module.import_items()  # reprocessar não duplica
    finally:
        import_items_module.ITEM_DUMP_PATH, import_items_module.ITEMS_JSON_PATH = original_paths

    result = await db_session.execute(select(Item).where(Item.unique_name.in_(UNIQUE_NAMES)))
    rows = result.scalars().all()
    assert len(rows) == len(UNIQUE_NAMES)
