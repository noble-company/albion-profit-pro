import json
from pathlib import Path

import pytest
from sqlalchemy import select

from scripts.import_locations import (
    SPECIAL_MARKETS,
    apply_location_import,
    prepare_location_import,
)
from src.items.models import Location

_MANIFEST = json.loads(
    (Path(__file__).resolve().parents[2] / "datasets" / "albion-static-2026-08-23.json").read_text(
        encoding="utf-8"
    )
)


def _write_world(tmp_path):
    path = tmp_path / "world.json"
    path.write_text(
        json.dumps(
            [
                {"Index": "1002", "UniqueName": "Lymhurst Market"},
                {"Index": "5003", "UniqueName": "Brecilien Market"},
            ]
        ),
        encoding="utf-8",
    )
    return path


def _write_xml_world_json(tmp_path):
    path = tmp_path / "world-xml.json"
    path.write_text(
        json.dumps(
            {
                "world": {
                    "clusters": {
                        "cluster": [
                            {"@id": "1002", "@displayname": "Lymhurst Market"},
                            {"@id": "5003", "@displayname": "Brecilien Market"},
                        ]
                    }
                }
            }
        ),
        encoding="utf-8",
    )
    return path


def test_location_import_accepts_json_converted_from_world_xml(tmp_path):
    plan = prepare_location_import(_write_xml_world_json(tmp_path), ["1002", "5003"], ["1002"])
    assert [(row["location_id"], row["name"]) for row in plan.rows] == [
        ("1002", "Lymhurst"),
        ("5003", "Brecilien"),
    ]


async def test_location_import_is_curated_and_idempotent(db_session, tmp_path):
    plan = prepare_location_import(_write_world(tmp_path), ["1002", "5003"], ["1002"])

    await apply_location_import(db_session, plan)
    await apply_location_import(db_session, plan)
    await db_session.commit()

    locations = (
        await db_session.execute(select(Location).order_by(Location.location_id))
    ).scalars()
    assert [(row.location_id, row.name, row.kind, row.is_royal_city) for row in locations] == [
        ("1002", "Lymhurst", "city", True),
        ("5003", "Brecilien", "city", False),
    ]


def test_every_confirmed_market_in_the_manifest_resolves_to_a_name(tmp_path):
    """A UI (F06, task 3.5/19) passa a depender de ``Location.name`` para todas as cidades reais
    — nenhum mapa hardcoded no cliente cobre o buraco. Este teste trava a curadoria: todo ID em
    ``confirmed_market_ids`` do manifesto tem que sair com ``name`` não-nulo e não-vazio."""
    confirmed = _MANIFEST["locations"]["confirmed_market_ids"]
    royal = _MANIFEST["locations"]["royal_city_ids"]

    clusters = [
        {"@id": location_id, "@displayname": f"{location_id} Market"}
        for location_id in confirmed
        if location_id not in SPECIAL_MARKETS
    ]
    path = tmp_path / "world-xml.json"
    path.write_text(json.dumps({"world": {"clusters": {"cluster": clusters}}}), encoding="utf-8")

    plan = prepare_location_import(path, confirmed, royal)

    assert {row["location_id"] for row in plan.rows} == set(confirmed)
    missing_name = [row["location_id"] for row in plan.rows if not row["name"]]
    assert missing_name == []


def test_location_import_rejects_unconfirmed_or_missing_ids(tmp_path):
    world = _write_world(tmp_path)

    with pytest.raises(ValueError, match="ausentes"):
        prepare_location_import(world, ["9999"], [])

    with pytest.raises(ValueError, match="não confirmadas"):
        prepare_location_import(world, ["1002"], ["5003"])
