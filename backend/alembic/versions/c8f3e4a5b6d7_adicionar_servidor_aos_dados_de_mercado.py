"""adicionar servidor aos dados de mercado

Revision ID: c8f3e4a5b6d7
Revises: b7e2d3f4a5c6
Create Date: 2026-08-23
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "c8f3e4a5b6d7"
down_revision: str | None = "b7e2d3f4a5c6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TABLES = (
    "market_order",
    "market_history_entry",
    "market_scan",
    "market_history_daily",
    "market_history_monthly",
)


def upgrade() -> None:
    for table in TABLES:
        op.add_column(table, sa.Column("server_id", sa.String(length=16), nullable=True))

    # Decisão explícita do proprietário em 2026-08-23: toda coleta anterior ocorreu no
    # Albion West. O backfill preserva esses fatos sem inferir servidor pela cidade/item.
    for table in TABLES:
        op.execute(sa.text(f"UPDATE {table} SET server_id = 'west' WHERE server_id IS NULL"))
        op.alter_column(table, "server_id", nullable=False)
        op.create_check_constraint(
            f"ck_{table}_server", table, "server_id IN ('west', 'east', 'europe')"
        )

    op.drop_constraint("uq_market_order_source", "market_order", type_="unique")
    op.drop_index("ix_market_order_book", table_name="market_order")
    op.create_unique_constraint(
        "uq_market_order_source", "market_order", ["server_id", "source_id"]
    )
    op.create_index(
        "ix_market_order_book",
        "market_order",
        ["server_id", "item_id", "location_id", "quality_level", "auction_type"],
    )

    constraints = {
        "market_history_entry": (
            "uq_market_history_bucket",
            [
                "server_id",
                "item_id",
                "location_id",
                "quality_level",
                "bucket_seconds",
                "bucket_start",
            ],
        ),
        "market_scan": (
            "uq_market_scan",
            [
                "server_id",
                "user_id",
                "item_key",
                "location_id",
                "quality_level",
                "fonte",
            ],
        ),
        "market_history_daily": (
            "uq_market_history_daily",
            ["server_id", "item_id", "location_id", "quality_level", "dia"],
        ),
        "market_history_monthly": (
            "uq_market_history_monthly",
            ["server_id", "item_id", "location_id", "quality_level", "mes"],
        ),
    }
    for table, (name, columns) in constraints.items():
        op.drop_constraint(name, table, type_="unique")
        op.create_unique_constraint(name, table, columns)

    op.drop_index("ix_market_history_lookup", table_name="market_history_entry")
    op.create_index(
        "ix_market_history_lookup",
        "market_history_entry",
        [
            "server_id",
            "item_id",
            "location_id",
            "quality_level",
            "bucket_seconds",
            "bucket_start",
        ],
    )


def downgrade() -> None:
    # Só o backfill West é reversível sem colisões nas constraints antigas.
    for table in TABLES:
        op.execute(sa.text(f"DELETE FROM {table} WHERE server_id <> 'west'"))

    op.drop_constraint("uq_market_order_source", "market_order", type_="unique")
    op.drop_index("ix_market_order_book", table_name="market_order")
    op.create_unique_constraint("uq_market_order_source", "market_order", ["source_id"])
    op.create_index(
        "ix_market_order_book",
        "market_order",
        ["item_id", "location_id", "quality_level", "auction_type"],
    )

    constraints = {
        "market_history_entry": (
            "uq_market_history_bucket",
            ["item_id", "location_id", "quality_level", "bucket_seconds", "bucket_start"],
        ),
        "market_scan": (
            "uq_market_scan",
            ["user_id", "item_key", "location_id", "quality_level", "fonte"],
        ),
        "market_history_daily": (
            "uq_market_history_daily",
            ["item_id", "location_id", "quality_level", "dia"],
        ),
        "market_history_monthly": (
            "uq_market_history_monthly",
            ["item_id", "location_id", "quality_level", "mes"],
        ),
    }
    for table, (name, columns) in constraints.items():
        op.drop_constraint(name, table, type_="unique")
        op.create_unique_constraint(name, table, columns)

    op.drop_index("ix_market_history_lookup", table_name="market_history_entry")
    op.create_index(
        "ix_market_history_lookup",
        "market_history_entry",
        ["item_id", "location_id", "quality_level", "bucket_seconds", "bucket_start"],
    )

    for table in reversed(TABLES):
        op.drop_constraint(f"ck_{table}_server", table, type_="check")
        op.drop_column(table, "server_id")
