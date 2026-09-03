"""
MarketOrder não tem mais user_id (task 27) — é o estado atual do book, uma tabela-fato
global, não amarrada a quem coletou.
"""

from datetime import datetime, timezone

from sqlalchemy import inspect

from src.database import engine
from src.prices.models import MarketOrder


async def test_market_order_indexes_exist():
    # inspect() precisa de uma conexão síncrona — com engine async, isso se faz
    # via conn.run_sync(callback), rodando o inspector dentro do greenlet do SQLAlchemy.
    async with engine.connect() as conn:

        def _get_indexes(sync_conn):
            return [ix["name"] for ix in inspect(sync_conn).get_indexes("market_order")]

        def _get_unique_constraints(sync_conn):
            return [uq["name"] for uq in inspect(sync_conn).get_unique_constraints("market_order")]

        index_names = await conn.run_sync(_get_indexes)
        unique_names = await conn.run_sync(_get_unique_constraints)

    assert "ix_market_order_book" in index_names
    assert "ix_market_order_last_seen_at" in index_names
    assert "uq_market_order_source" in unique_names


async def test_market_order_has_no_user_id_or_is_public_columns():
    """Pega regressão de migration (task 30): procedência por usuário vive em `market_scan`,
    não em colunas na tabela-fato."""
    async with engine.connect() as conn:

        def _get_columns(sync_conn):
            return {c["name"] for c in inspect(sync_conn).get_columns("market_order")}

        column_names = await conn.run_sync(_get_columns)

    assert "user_id" not in column_names
    assert "is_public" not in column_names


async def test_insert_and_select_market_order(db_session):
    order = MarketOrder(
        server_id="west",
        source_id=1,
        item_id="T2_FIBER",
        group_type_id="",
        location_id="1002",
        quality_level=1,
        enchantment_level=0,
        unit_price_silver=100,
        amount=50,
        auction_type="offer",
        expires=datetime(2026, 8, 22, tzinfo=timezone.utc),
    )
    db_session.add(order)
    await db_session.commit()
    await db_session.refresh(order)

    assert order.id is not None
    assert order.first_seen_at is not None  # server_default
    assert order.last_seen_at is not None  # server_default
