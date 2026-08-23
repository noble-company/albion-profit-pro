"""
Cobertura de baixo nível das queries agregadas (task 29) — complementa os testes de
ponta a ponta em tests/prices/test_router.py (C3, cache-first) e
tests/ingest/test_tasks.py (C4, recomputo pelo Postgres em vez de somar o lote).
"""

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import event

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
        db_session, [(item_id, "1002", 1, 0)], freshness_hours=FRESHNESS_HOURS
    )
    row = rows[(item_id, "1002", 1, 0)]
    assert row.menor_venda is None
    assert row.venda_qtd == 0


async def test_order_outside_freshness_window_does_not_count_but_varredura_em_reflects_age(
    db_session,
):
    """Prova o teste manual #4 da spec: profundidade zera fora da janela de frescor, mas
    `varredura_em` continua refletindo a última vez que a ordem foi vista (não fica None) —
    é o que permite a UI avisar 'esse dado tem X dias'."""
    item_id = _unique_item_id()
    old_seen_at = datetime.now(timezone.utc) - timedelta(days=2)
    db_session.add(
        MarketOrder(
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
        db_session, [(item_id, "1002", 1, 0)], freshness_hours=FRESHNESS_HOURS
    )
    row = rows[(item_id, "1002", 1, 0)]
    assert row.menor_venda is None  # fora da janela de 6h, não conta como oferta viva
    assert row.varredura_em == old_seen_at  # mas a idade real continua visível


async def test_get_item_prices_query_count_does_not_grow_with_location_count(db_session):
    """Prova o M1: 1 MGET + no máximo 1 query de profundidade + 1 de giro — não 1 por
    cidade. Registra 30 localizações "conhecidas" (além da que tem dado de verdade) e
    confirma que o número de queries SELECT no Postgres continua o mesmo de sempre."""
    item_id = _unique_item_id()
    db_session.add(
        MarketOrder(
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
        await get_item_prices(db_session, item_id, "all")
    finally:
        event.remove(db_engine.sync_engine, "before_cursor_execute", _on_execute)

    # list_location_ids (1) + profundidade (1) + giro 24h (1) — constante, não 1 por
    # combinação de (30+ locations) x 5 qualidades x 5 encantamentos.
    assert len(selects) <= 3
