from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.items.models import Location


def infer_location_kind(location_id: str) -> str:
    """Formatos medidos no jogo real (docs/03-contrato-ingest-real.md secao 4): numérico puro
    ("1002") é cidade; com sufixo ("1000-HellDen") é covil de contrabandista; com "@"
    ("3005@1") é rest/smuggler den. Nunca levanta exceção — formato desconhecido vira
    "desconhecido", não trava o ingest (a lista fixa antiga descartava; o upsert oportunista
    registra e deixa classificar depois com dado real na mão)."""
    if "@" in location_id:
        return "rest"
    if "-" in location_id:
        return "hell_den"
    if location_id.isdigit():
        return "city"
    return "desconhecido"


async def upsert_locations(session: AsyncSession, location_ids: set[str]) -> None:
    """Preenchimento oportunista: toda location_id vista num payload de ingest vira uma
    linha, sem sobrescrever `name`/`is_royal_city` que uma curadoria futura venha a definir
    (DO NOTHING, não DO UPDATE — `kind` é determinístico a partir do formato, então não há
    nada de novo a atualizar num reenvio)."""
    if not location_ids:
        return
    rows = [{"location_id": lid, "kind": infer_location_kind(lid)} for lid in location_ids]
    stmt = pg_insert(Location).values(rows)
    stmt = stmt.on_conflict_do_nothing(index_elements=["location_id"])
    await session.execute(stmt)


async def list_location_ids(session: AsyncSession) -> list[str]:
    result = await session.execute(select(Location.location_id))
    return list(result.scalars().all())
