"""add market_history_entry table

Revision ID: 8c2b0770b34d
Revises: 754507d56907
Create Date: 2026-08-21 22:13:23.166255

"""

from typing import Sequence, Union

import fastapi_users_db_sqlalchemy
import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "8c2b0770b34d"
down_revision: Union[str, Sequence[str], None] = "754507d56907"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "market_history_entry",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("item_id", sa.BigInteger(), nullable=False),
        sa.Column("location_id", sa.String(length=16), nullable=False),
        sa.Column("quality_level", sa.Integer(), nullable=False),
        sa.Column("timescale", sa.Integer(), nullable=False),
        sa.Column("item_amount", sa.BigInteger(), nullable=False),
        sa.Column("silver_amount", sa.BigInteger(), nullable=False),
        sa.Column("timestamp", sa.BigInteger(), nullable=False),
        sa.Column("user_id", fastapi_users_db_sqlalchemy.generics.GUID(), nullable=False),
        sa.Column("is_public", sa.Boolean(), nullable=False),
        sa.Column("collected_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["user.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "item_id",
            "location_id",
            "quality_level",
            "timescale",
            "timestamp",
            "user_id",
            name="uq_market_history_entry_point",
        ),
    )
    op.create_index(
        op.f("ix_market_history_entry_item_id"), "market_history_entry", ["item_id"], unique=False
    )
    op.create_index(
        op.f("ix_market_history_entry_location_id"),
        "market_history_entry",
        ["location_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_market_history_entry_user_id"), "market_history_entry", ["user_id"], unique=False
    )
    op.create_index(
        "ix_market_history_item_location_quality_timescale",
        "market_history_entry",
        ["item_id", "location_id", "quality_level", "timescale"],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(
        "ix_market_history_item_location_quality_timescale", table_name="market_history_entry"
    )
    op.drop_index(op.f("ix_market_history_entry_user_id"), table_name="market_history_entry")
    op.drop_index(op.f("ix_market_history_entry_location_id"), table_name="market_history_entry")
    op.drop_index(op.f("ix_market_history_entry_item_id"), table_name="market_history_entry")
    op.drop_table("market_history_entry")
