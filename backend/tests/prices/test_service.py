"""
Cobertura de baixo nível das queries agregadas (task 29) — complementa os testes de
ponta a ponta em tests/prices/test_router.py (C3, cache-first) e
tests/ingest/test_tasks.py (C4, recomputo pelo Postgres em vez de somar o lote).
"""

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import event, text

from src.database import engine as db_engine
from src.items.service import upsert_locations
from src.prices.models import MarketOrder
from src.prices.service import get_item_prices, query_book_depth

FRESHNESS_HOURS = 6


def _unique_item_id() -> str:
    return f"T2_TESTITEM_{uuid.uuid4().hex[:8]}"


def _unique_source_id() -> int:
    return uuid.uuid4().int % 1_000_000_000


async def test_expired_order_does_not_count_toward_depth(db_session):
    item_id = _unique_item_id()
    db_session.add(
        MarketOrder(
            server_id="west",
            source_id=_unique_source_id(),
            item_id=item_id,
            group_type_id="",
            location_id="1002",
            quality_level=1,
            enchantment_level=0,
            unit_price_silver=Decimal("39"),
            amount=10,
            auction_type="offer",
            expires=datetime.now(timezone.utc) - timedelta(days=1),  # já expirou
        )
    )
    await db_session.commit()

    rows = await query_book_depth(
        db_session, "west", [(item_id, "1002", 1, 0)], freshness_hours=FRESHNESS_HOURS
    )
    row = rows[(item_id, "1002", 1, 0)]
    assert row.menor_venda is None
    assert row.venda_qtd == 0


async def test_order_outside_freshness_window_has_no_observation_metadata(
    db_session,
):
    """Uma ordem velha não pode parecer uma observação válida dentro da janela atual."""
    item_id = _unique_item_id()
    old_seen_at = datetime.now(timezone.utc) - timedelta(days=2)
    db_session.add(
        MarketOrder(
            server_id="west",
            source_id=_unique_source_id(),
            item_id=item_id,
            group_type_id="",
            location_id="1002",
            quality_level=1,
            enchantment_level=0,
            unit_price_silver=Decimal("39"),
            amount=10,
            auction_type="offer",
            expires=datetime.now(timezone.utc) + timedelta(days=30),  # não expirou
            last_seen_at=old_seen_at,  # mas não é visto há 2 dias
        )
    )
    await db_session.commit()

    rows = await query_book_depth(
        db_session, "west", [(item_id, "1002", 1, 0)], freshness_hours=FRESHNESS_HOURS
    )
    row = rows[(item_id, "1002", 1, 0)]
    assert row.menor_venda is None  # fora da janela de 6h, não conta como oferta viva
    assert row.venda_observada_em is None


async def test_side_observation_timestamp_belongs_to_best_price(db_session):
    item_id = _unique_item_id()
    now = datetime.now(timezone.utc)
    best_seen_at = now - timedelta(hours=2)
    newest_seen_at = now - timedelta(minutes=5)
    for price, seen_at in ((Decimal("39"), best_seen_at), (Decimal("45"), newest_seen_at)):
        db_session.add(
            MarketOrder(
                server_id="west",
                source_id=_unique_source_id(),
                item_id=item_id,
                group_type_id="",
                location_id="1002",
                quality_level=1,
                enchantment_level=0,
                unit_price_silver=price,
                amount=10,
                auction_type="offer",
                expires=now + timedelta(days=30),
                last_seen_at=seen_at,
            )
        )
    await db_session.commit()

    rows = await query_book_depth(
        db_session, "west", [(item_id, "1002", 1, 0)], freshness_hours=FRESHNESS_HOURS
    )
    row = rows[(item_id, "1002", 1, 0)]
    assert row.menor_venda == Decimal("39")
    assert row.venda_observada_em == best_seen_at


async def test_get_item_prices_query_count_does_not_grow_with_location_count(db_session):
    """Prova o M1: 1 MGET + no máximo 1 query de profundidade + 1 de giro — não 1 por
    cidade. Registra 30 localizações "conhecidas" (além da que tem dado de verdade) e
    confirma que o número de queries SELECT no Postgres continua o mesmo de sempre."""
    item_id = _unique_item_id()
    db_session.add(
        MarketOrder(
            server_id="west",
            source_id=_unique_source_id(),
            item_id=item_id,
            group_type_id="",
            location_id="1002",
            quality_level=1,
            enchantment_level=0,
            unit_price_silver=Decimal("39"),
            amount=10,
            auction_type="offer",
            expires=datetime.now(timezone.utc) + timedelta(days=30),
        )
    )
    await upsert_locations(db_session, {f"ZZCITY_{i}" for i in range(30)} | {"1002"})
    await db_session.commit()

    selects: list[str] = []

    def _on_execute(conn, cursor, statement, parameters, context, executemany):
        if "SELECT" in statement.upper():
            selects.append(statement)

    event.listen(db_engine.sync_engine, "before_cursor_execute", _on_execute)
    try:
        page = await get_item_prices(db_session, "west", item_id, "all")
    finally:
        event.remove(db_engine.sync_engine, "before_cursor_execute", _on_execute)

    assert page["total"] == 1
    assert len(page["prices"]) == 1
    # COUNT das combinações + página + profundidade + giro: constante e proporcional às
    # combinações existentes, não ao cadastro global de cidades/qualidades/encantamentos.
    assert len(selects) <= 4


async def test_representative_book_query_plan_uses_existing_index(db_session):
    """EXPLAIN ANALYZE com 3.000 ordens: o índice existente reduz o conjunto por
    realm/item/local/qualidade; encantamento, lado, expiração e frescor ficam nos filtros
    do agregado. O plano medido não justificou uma migration adicional na task 12.
    """
    target_item = _unique_item_id()
    now = datetime.now(timezone.utc)
    rows = []
    for index in range(3_000):
        is_target = index < 10
        rows.append(
            {
                "id": uuid.uuid4(),
                "server_id": "west",
                "source_id": 10_000_000_000 + index,
                "item_id": target_item if is_target else f"T4_NOISE_{index % 300}",
                "group_type_id": "",
                "location_id": "1002",
                "quality_level": 1,
                "enchantment_level": 0,
                "unit_price_silver": Decimal(100 + index),
                "amount": 1,
                "auction_type": "offer" if index % 2 == 0 else "request",
                "expires": now + timedelta(days=30),
                "first_seen_at": now,
                "last_seen_at": now,
            }
        )
    await db_session.execute(MarketOrder.__table__.insert(), rows)
    await db_session.execute(text("ANALYZE market_order"))

    plan = await db_session.scalar(
        text(
            """
            EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
            SELECT item_id, location_id, quality_level, enchantment_level,
                   min(unit_price_silver) FILTER (
                       WHERE expires > now()
                         AND last_seen_at > now() - interval '6 hours'
                         AND auction_type = 'offer'
                   ),
                   (array_agg(last_seen_at ORDER BY unit_price_silver ASC, last_seen_at DESC)
                       FILTER (
                           WHERE expires > now()
                             AND last_seen_at > now() - interval '6 hours'
                             AND auction_type = 'offer'
                       ))[1]
            FROM market_order
            WHERE server_id = 'west'
              AND item_id = :item_id
              AND location_id = '1002'
              AND quality_level = 1
              AND enchantment_level = 0
            GROUP BY item_id, location_id, quality_level, enchantment_level
            """
        ),
        {"item_id": target_item},
    )
    assert "ix_market_order_book" in str(plan)
