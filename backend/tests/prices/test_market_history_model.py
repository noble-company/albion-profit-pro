"""
MarketHistoryEntry não tem mais user_id (task 26) — é uma tabela-fato global, autoritativa do
servidor do jogo, não amarrada a quem coletou.
"""

from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import inspect, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.sql import func

from src.database import engine
from src.prices.models import MarketHistoryEntry

BUCKET_START = datetime(2026, 8, 21, 18, 0, tzinfo=timezone.utc)


async def test_market_history_entry_has_no_user_id_or_is_public_columns():
    """Pega regressão de migration (task 30): procedência por usuário vive em `market_scan`,
    não em colunas na tabela-fato."""
    async with engine.connect() as conn:

        def _get_columns(sync_conn):
            return {c["name"] for c in inspect(sync_conn).get_columns("market_history_entry")}

        column_names = await conn.run_sync(_get_columns)

    assert "user_id" not in column_names
    assert "is_public" not in column_names


def _sample_entry(item_id: int = 999999001) -> dict:
    return {
        "item_id": item_id,
        "location_id": "1002",
        "quality_level": 1,
        "bucket_seconds": 21600,
        "bucket_start": BUCKET_START,
        "item_amount": 500,
        "silver_amount": Decimal("5"),
    }


async def test_duplicate_exact_bucket_rejected_by_constraint(db_session):
    entry = MarketHistoryEntry(**_sample_entry())
    db_session.add(entry)
    await db_session.commit()

    # inserir a mesma combinação de novo -> viola a UniqueConstraint
    duplicate = MarketHistoryEntry(**_sample_entry())
    db_session.add(duplicate)
    raised = False
    try:
        await db_session.commit()
    except IntegrityError:
        raised = True
        # rollback() expira os objetos da sessão — usar a constante capturada antes, não
        # `entry.item_id`, senão o SQLAlchemy tenta um lazy-load síncrono fora de contexto
        # async e quebra com MissingGreenlet.
        await db_session.rollback()
    assert raised


async def test_on_conflict_do_update_corrects_partial_bucket(db_session):
    """O bucket corrente é parcial e cresce — reenviar o mesmo bucket com um valor maior tem
    que atualizar a linha, não descartar (era o `DO NOTHING` quebrado da task 17)."""
    item_id = 999999002

    first = _sample_entry(item_id) | {"item_amount": 40, "silver_amount": Decimal("4")}
    stmt = pg_insert(MarketHistoryEntry).values(first)
    stmt = stmt.on_conflict_do_update(
        constraint="uq_market_history_bucket",
        set_={
            "item_amount": stmt.excluded.item_amount,
            "silver_amount": stmt.excluded.silver_amount,
            "last_seen_at": func.now(),
        },
    )
    await db_session.execute(stmt)
    await db_session.commit()

    second = _sample_entry(item_id) | {
        "item_amount": 91996,
        "silver_amount": Decimal("3584.4290"),
    }
    stmt = pg_insert(MarketHistoryEntry).values(second)
    stmt = stmt.on_conflict_do_update(
        constraint="uq_market_history_bucket",
        set_={
            "item_amount": stmt.excluded.item_amount,
            "silver_amount": stmt.excluded.silver_amount,
            "last_seen_at": func.now(),
        },
    )
    await db_session.execute(stmt)
    await db_session.commit()

    result = await db_session.execute(
        select(MarketHistoryEntry).where(MarketHistoryEntry.item_id == item_id)
    )
    rows = result.scalars().all()
    assert len(rows) == 1  # não duplicou — atualizou a mesma linha
    assert rows[0].item_amount == 91996
    assert rows[0].silver_amount == Decimal("3584.4290")
