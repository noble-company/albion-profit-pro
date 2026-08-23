"""remodelar market_history_entry para bucket global

Revision ID: 80ba87175991
Revises: 1333937da673
Create Date: 2026-08-22 16:15:10.755488

"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "80ba87175991"
down_revision: Union[str, Sequence[str], None] = "1333937da673"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("market_history_entry", sa.Column("bucket_seconds", sa.Integer(), nullable=False))
    op.add_column(
        "market_history_entry",
        sa.Column("bucket_start", sa.DateTime(timezone=True), nullable=False),
    )
    op.add_column(
        "market_history_entry",
        sa.Column(
            "first_seen_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.add_column(
        "market_history_entry",
        sa.Column(
            "last_seen_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.alter_column(
        "market_history_entry",
        "location_id",
        existing_type=sa.VARCHAR(length=16),
        type_=sa.String(length=64),
        existing_nullable=False,
    )
    op.drop_index(op.f("ix_market_history_entry_user_id"), table_name="market_history_entry")
    op.drop_index(
        op.f("ix_market_history_item_location_quality_timescale"), table_name="market_history_entry"
    )
    op.drop_constraint(
        op.f("uq_market_history_entry_point"), "market_history_entry", type_="unique"
    )
    op.create_index(
        "ix_market_history_lookup",
        "market_history_entry",
        ["item_id", "location_id", "quality_level", "bucket_seconds", "bucket_start"],
        unique=False,
    )
    op.create_unique_constraint(
        "uq_market_history_bucket",
        "market_history_entry",
        ["item_id", "location_id", "quality_level", "bucket_seconds", "bucket_start"],
    )
    op.drop_constraint(
        op.f("market_history_entry_user_id_fkey"), "market_history_entry", type_="foreignkey"
    )
    op.drop_column("market_history_entry", "timescale")
    op.drop_column("market_history_entry", "is_public")
    op.drop_column("market_history_entry", "user_id")
    op.drop_column("market_history_entry", "collected_at")
    op.drop_column("market_history_entry", "timestamp")


def downgrade() -> None:
    """Downgrade schema."""
    op.add_column(
        "market_history_entry",
        sa.Column("timestamp", sa.BIGINT(), autoincrement=False, nullable=False),
    )
    op.add_column(
        "market_history_entry",
        sa.Column(
            "collected_at",
            postgresql.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            autoincrement=False,
            nullable=False,
        ),
    )
    op.add_column(
        "market_history_entry", sa.Column("user_id", sa.UUID(), autoincrement=False, nullable=False)
    )
    op.add_column(
        "market_history_entry",
        sa.Column("is_public", sa.BOOLEAN(), autoincrement=False, nullable=False),
    )
    op.add_column(
        "market_history_entry",
        sa.Column("timescale", sa.INTEGER(), autoincrement=False, nullable=False),
    )
    op.create_foreign_key(
        op.f("market_history_entry_user_id_fkey"),
        "market_history_entry",
        "user",
        ["user_id"],
        ["id"],
    )
    op.drop_constraint("uq_market_history_bucket", "market_history_entry", type_="unique")
    op.drop_index("ix_market_history_lookup", table_name="market_history_entry")
    op.create_unique_constraint(
        op.f("uq_market_history_entry_point"),
        "market_history_entry",
        ["item_id", "location_id", "quality_level", "timescale", "timestamp", "user_id"],
        postgresql_nulls_not_distinct=False,
    )
    op.create_index(
        op.f("ix_market_history_item_location_quality_timescale"),
        "market_history_entry",
        ["item_id", "location_id", "quality_level", "timescale"],
        unique=False,
    )
    op.create_index(
        op.f("ix_market_history_entry_user_id"), "market_history_entry", ["user_id"], unique=False
    )
    op.alter_column(
        "market_history_entry",
        "location_id",
        existing_type=sa.String(length=64),
        type_=sa.VARCHAR(length=16),
        existing_nullable=False,
    )
    op.drop_column("market_history_entry", "last_seen_at")
    op.drop_column("market_history_entry", "first_seen_at")
    op.drop_column("market_history_entry", "bucket_start")
    op.drop_column("market_history_entry", "bucket_seconds")
