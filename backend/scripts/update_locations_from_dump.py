"""Atualiza localidades curadas a partir de um world.json já baixado."""

import argparse
import asyncio
from pathlib import Path

from scripts.import_locations import apply_location_import, prepare_location_import
from src.database import async_session_maker


async def main(world_path: Path) -> None:
    market_ids = ["3005", "2004", "4002", "1002", "1301", "3008", "0007", "5003", "3003"]
    plan = prepare_location_import(world_path, market_ids, market_ids[:-2])
    async with async_session_maker() as session:
        await apply_location_import(session, plan)
        await session.commit()
    print(
        f"Atualizadas {len(plan.rows)} localidades: {', '.join(row['name'] for row in plan.rows)}"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("world", type=Path)
    args = parser.parse_args()
    asyncio.run(main(args.world))
