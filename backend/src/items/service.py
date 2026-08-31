from sqlalchemy import String, case, cast, exists, func, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.items.models import Item, Location
from src.items.normalization import normalize_item_search
from src.recipes.models import Recipe


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


def _item_projection():
    has_recipe = exists(select(Recipe.id).where(Recipe.output_item_unique_name == Item.unique_name))
    return (
        Item.unique_name,
        Item.albion_id,
        Item.name_pt,
        Item.name_en,
        Item.tier,
        Item.enchantment_level,
        Item.shop_category,
        Item.shop_subcategory,
        Item.shop_subcategory2,
        Item.shop_subcategory3,
        has_recipe.label("tem_receita"),
    )


async def search_items(
    session: AsyncSession,
    *,
    query: str,
    tier: int | None,
    enchantment_level: int | None,
    category: str | None,
    craftable_only: bool,
    limit: int,
) -> list[dict]:
    normalized_query = normalize_item_search(query)
    statement = select(*_item_projection()).where(
        Item.busca_normalizada.contains(normalized_query, autoescape=True)
    )

    if tier is not None:
        statement = statement.where(Item.tier == tier)
    if enchantment_level is not None:
        statement = statement.where(Item.enchantment_level == enchantment_level)
    if category:
        normalized_category = category.casefold()
        statement = statement.where(
            or_(
                func.lower(Item.shop_category) == normalized_category,
                func.lower(Item.shop_subcategory) == normalized_category,
            )
        )
    if craftable_only:
        statement = statement.where(
            exists(select(Recipe.id).where(Recipe.output_item_unique_name == Item.unique_name))
        )

    normalized_unique_name = func.lower(cast(Item.unique_name, String))
    statement = statement.order_by(
        case((normalized_unique_name == normalized_query, 0), else_=1),
        case((normalized_unique_name.startswith(normalized_query, autoescape=True), 0), else_=1),
        func.coalesce(Item.name_pt, Item.name_en, Item.unique_name),
        Item.unique_name,
    ).limit(limit)
    rows = await session.execute(statement)
    return [dict(row._mapping) for row in rows]


async def get_item_detail(session: AsyncSession, unique_name: str) -> dict | None:
    statement = select(*_item_projection()).where(Item.unique_name == unique_name)
    row = (await session.execute(statement)).first()
    return dict(row._mapping) if row is not None else None


async def list_locations(session: AsyncSession) -> list[dict]:
    rows = await session.execute(
        select(Location).order_by(
            Location.is_royal_city.desc(),
            Location.name.asc().nulls_last(),
            Location.location_id,
        )
    )
    return [
        {
            "location_id": location.location_id,
            "name": location.name,
            "display_name": location.name or location.location_id,
            "kind": location.kind,
            "is_royal_city": location.is_royal_city,
        }
        for location in rows.scalars()
    ]


async def list_categories(session: AsyncSession) -> list[dict]:
    rows = await session.execute(
        select(
            Item.shop_category,
            Item.shop_subcategory,
            Item.shop_subcategory2,
            Item.shop_subcategory3,
        )
        .where(Item.shop_category.is_not(None))
        .distinct()
        .order_by(
            Item.shop_category,
            Item.shop_subcategory,
            Item.shop_subcategory2,
            Item.shop_subcategory3,
        )
    )
    return [
        {
            "category": category,
            "subcategory": subcategory,
            "subcategory2": subcategory2,
            "subcategory3": subcategory3,
        }
        for category, subcategory, subcategory2, subcategory3 in rows
        if category
    ]


async def list_eligible_craft_locations(session: AsyncSession) -> list[dict]:
    """Return only curated city markets, excluding opportunistic ingest discoveries."""

    rows = await session.execute(
        select(Location.location_id, Location.name)
        .where(Location.kind == "city", Location.name.is_not(None))
        .order_by(Location.name, Location.location_id)
    )
    return [{"location_id": location_id, "name": name} for location_id, name in rows]
