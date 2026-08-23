"""remodelar market_order para estado atual do livro

Revision ID: 2a61cb833442
Revises: 80ba87175991
Create Date: 2026-08-22 16:29:32.259397

"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "2a61cb833442"
down_revision: Union[str, Sequence[str], None] = "80ba87175991"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "market_order",
        sa.Column(
            "first_seen_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.add_column(
        "market_order",
        sa.Column(
            "last_seen_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.alter_column(
        "market_order",
        "location_id",
        existing_type=sa.VARCHAR(length=16),
        type_=sa.String(length=64),
        existing_nullable=False,
    )
    op.drop_index(op.f("ix_market_order_collected_at"), table_name="market_order")
    op.drop_index(op.f("ix_market_order_item_location_quality"), table_name="market_order")
    op.drop_index(op.f("ix_market_order_user_id"), table_name="market_order")
    op.create_index(
        "ix_market_order_book",
        "market_order",
        ["item_id", "location_id", "quality_level", "auction_type"],
        unique=False,
    )
    op.create_index(
        op.f("ix_market_order_last_seen_at"), "market_order", ["last_seen_at"], unique=False
    )
    op.create_unique_constraint("uq_market_order_source", "market_order", ["source_id"])
    op.drop_constraint(op.f("market_order_user_id_fkey"), "market_order", type_="foreignkey")
    op.drop_column("market_order", "user_id")
    op.drop_column("market_order", "is_public")
    op.drop_column("market_order", "collected_at")


def downgrade() -> None:
    """Downgrade schema."""
    op.add_column(
        "market_order",
        sa.Column(
            "collected_at",
            postgresql.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            autoincrement=False,
            nullable=False,
        ),
    )
    op.add_column(
        "market_order", sa.Column("is_public", sa.BOOLEAN(), autoincrement=False, nullable=False)
    )
    op.add_column(
        "market_order", sa.Column("user_id", sa.UUID(), autoincrement=False, nullable=False)
    )
    op.create_foreign_key(
        op.f("market_order_user_id_fkey"), "market_order", "user", ["user_id"], ["id"]
    )
    op.drop_constraint("uq_market_order_source", "market_order", type_="unique")
    op.drop_index(op.f("ix_market_order_last_seen_at"), table_name="market_order")
    op.drop_index("ix_market_order_book", table_name="market_order")
    op.create_index(op.f("ix_market_order_user_id"), "market_order", ["user_id"], unique=False)
    op.create_index(
        op.f("ix_market_order_item_location_quality"),
        "market_order",
        ["item_id", "location_id", "quality_level"],
        unique=False,
    )
    op.create_index(
        op.f("ix_market_order_collected_at"), "market_order", ["collected_at"], unique=False
    )
    op.alter_column(
        "market_order",
        "location_id",
        existing_type=sa.String(length=64),
        type_=sa.VARCHAR(length=16),
        existing_nullable=False,
    )
    op.drop_column("market_order", "last_seen_at")
    op.drop_column("market_order", "first_seen_at")
