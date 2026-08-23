"""adicionar rollup diario e mensal

Revision ID: 81de3361cd01
Revises: e09bad535abd
Create Date: 2026-08-22 18:54:17.444995

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "81de3361cd01"
down_revision: Union[str, Sequence[str], None] = "e09bad535abd"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "market_history_daily",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("item_id", sa.BigInteger(), nullable=False),
        sa.Column("location_id", sa.String(length=64), nullable=False),
        sa.Column("quality_level", sa.Integer(), nullable=False),
        sa.Column("dia", sa.Date(), nullable=False),
        sa.Column("item_amount", sa.BigInteger(), nullable=False),
        sa.Column("silver_amount", sa.Numeric(precision=20, scale=4), nullable=False),
        sa.Column("preco_medio", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "item_id", "location_id", "quality_level", "dia", name="uq_market_history_daily"
        ),
    )
    op.create_index(
        op.f("ix_market_history_daily_dia"), "market_history_daily", ["dia"], unique=False
    )
    op.create_index(
        op.f("ix_market_history_daily_item_id"), "market_history_daily", ["item_id"], unique=False
    )
    op.create_index(
        op.f("ix_market_history_daily_location_id"),
        "market_history_daily",
        ["location_id"],
        unique=False,
    )
    op.create_table(
        "market_history_monthly",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("item_id", sa.BigInteger(), nullable=False),
        sa.Column("location_id", sa.String(length=64), nullable=False),
        sa.Column("quality_level", sa.Integer(), nullable=False),
        sa.Column("mes", sa.Date(), nullable=False),
        sa.Column("item_amount", sa.BigInteger(), nullable=False),
        sa.Column("silver_amount", sa.Numeric(precision=20, scale=4), nullable=False),
        sa.Column("preco_medio", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "item_id", "location_id", "quality_level", "mes", name="uq_market_history_monthly"
        ),
    )
    op.create_index(
        op.f("ix_market_history_monthly_item_id"),
        "market_history_monthly",
        ["item_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_market_history_monthly_location_id"),
        "market_history_monthly",
        ["location_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_market_history_monthly_mes"), "market_history_monthly", ["mes"], unique=False
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_market_history_monthly_mes"), table_name="market_history_monthly")
    op.drop_index(
        op.f("ix_market_history_monthly_location_id"), table_name="market_history_monthly"
    )
    op.drop_index(op.f("ix_market_history_monthly_item_id"), table_name="market_history_monthly")
    op.drop_table("market_history_monthly")
    op.drop_index(op.f("ix_market_history_daily_location_id"), table_name="market_history_daily")
    op.drop_index(op.f("ix_market_history_daily_item_id"), table_name="market_history_daily")
    op.drop_index(op.f("ix_market_history_daily_dia"), table_name="market_history_daily")
    op.drop_table("market_history_daily")
