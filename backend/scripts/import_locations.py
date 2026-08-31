"""Curadoria reproduzível de mercados confirmados a partir do ``formatted/world.json``."""

import json
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.items.models import Location


@dataclass(frozen=True)
class LocationImportPlan:
    rows: list[dict]


SPECIAL_MARKETS = {"1301": "Lymhurst", "3003": "Black Market"}


def _location_names(payload: object) -> dict[str, str]:
    """Extrai mercados tanto do world.json tabular antigo quanto do JSON do XML do jogo."""
    if isinstance(payload, list):
        return {
            str(entry["Index"]): str(entry["UniqueName"])
            for entry in payload
            if isinstance(entry, dict)
            and entry.get("Index") is not None
            and entry.get("UniqueName")
        }
    names: dict[str, str] = {}

    def walk(value: object) -> None:
        if isinstance(value, dict):
            identifier = value.get("@id")
            display_name = value.get("@displayname")
            if (
                identifier is not None
                and isinstance(display_name, str)
                and display_name.endswith(" Market")
            ):
                names[str(identifier)] = display_name
            for child in value.values():
                walk(child)
        elif isinstance(value, list):
            for child in value:
                walk(child)

    walk(payload)
    return names


def prepare_location_import(
    world_path: Path,
    confirmed_market_ids: list[str],
    royal_city_ids: list[str],
) -> LocationImportPlan:
    names = _location_names(json.loads(world_path.read_text(encoding="utf-8")))
    names.update(
        {key: value for key, value in SPECIAL_MARKETS.items() if key in confirmed_market_ids}
    )
    missing = sorted(set(confirmed_market_ids) - names.keys())
    if missing:
        raise ValueError(f"Localizações confirmadas ausentes no world.json: {missing}")

    royal_ids = set(royal_city_ids)
    unknown_royal = sorted(royal_ids - set(confirmed_market_ids))
    if unknown_royal:
        raise ValueError(f"Cidades reais não confirmadas como mercados: {unknown_royal}")

    rows = []
    for location_id in confirmed_market_ids:
        source_name = names[location_id]
        display_name = (
            source_name
            if location_id in SPECIAL_MARKETS
            else source_name.removesuffix(" Market").strip()
        )
        rows.append(
            {
                "location_id": location_id,
                "name": display_name or None,
                "kind": "city",
                "is_royal_city": location_id in royal_ids,
            }
        )
    return LocationImportPlan(rows)


async def apply_location_import(session: AsyncSession, plan: LocationImportPlan) -> None:
    if not plan.rows:
        return
    statement = pg_insert(Location).values(plan.rows)
    statement = statement.on_conflict_do_update(
        index_elements=["location_id"],
        set_={
            "name": statement.excluded.name,
            "kind": statement.excluded.kind,
            "is_royal_city": statement.excluded.is_royal_city,
        },
    )
    await session.execute(statement)
