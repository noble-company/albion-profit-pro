"""
Prova o motivo de existir da tabela `item` (achado N3): `markethistories.ingest` usa
`AlbionId` (int), `marketorders.ingest` usa `ItemTypeId` (string) — sem uma ponte não dá
pra juntar os dois. Grava um histórico e uma ordem do "mesmo" item e confirma que um JOIN
via `item` devolve as duas pontas.
"""

from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select

from src.items.models import Item
from src.prices.models import MarketHistoryEntry, MarketOrder

UNIQUE_NAME = "ZZFIBER_JOIN_TEST"
ALBION_ID = 950001


async def test_join_crosses_from_albion_id_to_item_type_id(db_session):
    db_session.add(Item(unique_name=UNIQUE_NAME, albion_id=ALBION_ID))
    db_session.add(
        MarketHistoryEntry(
            item_id=ALBION_ID,
            location_id="1002",
            quality_level=1,
            bucket_seconds=21600,
            bucket_start=datetime(2026, 8, 22, tzinfo=timezone.utc),
            item_amount=100,
            silver_amount=Decimal("50"),
        )
    )
    db_session.add(
        MarketOrder(
            source_id=950001999,
            item_id=UNIQUE_NAME,
            group_type_id="",
            location_id="1002",
            quality_level=1,
            enchantment_level=0,
            unit_price_silver=Decimal("37"),
            amount=10,
            auction_type="offer",
            expires=datetime(2026, 9, 22, tzinfo=timezone.utc),
        )
    )
    await db_session.commit()

    # 1 salto pra chegar no ItemTypeId a partir do AlbionId do histórico
    history_item_type_id = await db_session.scalar(
        select(Item.unique_name)
        .join(MarketHistoryEntry, MarketHistoryEntry.item_id == Item.albion_id)
        .where(MarketHistoryEntry.item_id == ALBION_ID)
    )
    assert history_item_type_id == UNIQUE_NAME

    # junção completa: histórico + item + ordem, os três lados numa query só
    result = await db_session.execute(
        select(MarketHistoryEntry.item_amount, MarketOrder.unit_price_silver)
        .select_from(MarketHistoryEntry)
        .join(Item, Item.albion_id == MarketHistoryEntry.item_id)
        .join(MarketOrder, MarketOrder.item_id == Item.unique_name)
        .where(Item.unique_name == UNIQUE_NAME)
    )
    row = result.one()
    assert row.item_amount == 100
    assert row.unit_price_silver == Decimal("37")
