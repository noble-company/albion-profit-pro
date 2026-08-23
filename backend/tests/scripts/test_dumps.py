"""Cobertura da task 35 — carregamento compartilhado dos dois JSONs de origem
(scripts/_dumps.py), usado por import_recipes.py e import_items.py."""

import re
from pathlib import Path

import pytest

from scripts._dumps import as_list, iter_category_entries, load_item_dump_items, load_items_json


def test_load_items_json_raises_clear_error_with_path_when_missing(tmp_path):
    missing = tmp_path / "nao-existe.json"
    with pytest.raises(FileNotFoundError, match=re.escape(str(missing))):
        load_items_json(missing)


def test_load_item_dump_items_raises_clear_error_with_path_when_missing(tmp_path):
    missing = tmp_path / "ITEM DUMP.json"
    with pytest.raises(FileNotFoundError, match=re.escape(str(missing))):
        load_item_dump_items(missing)


def test_as_list_normalizes_single_object_and_list_and_none():
    assert as_list(None) == []
    assert as_list({"a": 1}) == [{"a": 1}]
    assert as_list([{"a": 1}, {"a": 2}]) == [{"a": 1}, {"a": 2}]


def test_iter_category_entries_flattens_relevant_categories(tmp_path):
    items = {
        "simpleitem": {"@uniquename": "A"},
        "weapon": [{"@uniquename": "B"}, {"@uniquename": "C"}],
        "mount": [{"@uniquename": "IGNORADO"}],  # fora de RELEVANT_CATEGORIES
    }
    names = {e["@uniquename"] for e in iter_category_entries(items)}
    assert names == {"A", "B", "C"}


def test_load_item_dump_items_returns_only_items_block(tmp_path):
    path: Path = tmp_path / "ITEM DUMP.json"
    path.write_text('{"items": {"simpleitem": [{"@uniquename": "X"}]}}', encoding="utf-8")
    items = load_item_dump_items(path)
    assert items == {"simpleitem": [{"@uniquename": "X"}]}
