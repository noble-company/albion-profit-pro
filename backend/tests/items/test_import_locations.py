import json

import pytest
from sqlalchemy import select

from scripts.import_locations import apply_location_import, prepare_location_import
from src.items.models import Location


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


def test_location_import_rejects_unconfirmed_or_missing_ids(tmp_path):
    world = _write_world(tmp_path)

    with pytest.raises(ValueError, match="ausentes"):
        prepare_location_import(world, ["9999"], [])

    with pytest.raises(ValueError, match="não confirmadas"):
        prepare_location_import(world, ["1002"], ["5003"])
