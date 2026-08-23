"""add market_order table

Revision ID: 754507d56907
Revises: 1fe34bc035f3
Create Date: 2026-08-21 22:11:05.344326

"""

from typing import Sequence, Union

import fastapi_users_db_sqlalchemy
import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "754507d56907"
down_revision: Union[str, Sequence[str], None] = "1fe34bc035f3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "market_order",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("source_id", sa.BigInteger(), nullable=False),
        sa.Column("item_id", sa.String(length=64), nullable=False),
        sa.Column("group_type_id", sa.String(length=64), nullable=False),
        sa.Column("location_id", sa.String(length=16), nullable=False),
        sa.Column("quality_level", sa.Integer(), nullable=False),
        sa.Column("enchantment_level", sa.Integer(), nullable=False),
        sa.Column("unit_price_silver", sa.BigInteger(), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("auction_type", sa.String(length=16), nullable=False),
        sa.Column("expires", sa.String(length=32), nullable=False),
        sa.Column("user_id", fastapi_users_db_sqlalchemy.generics.GUID(), nullable=False),
        sa.Column("is_public", sa.Boolean(), nullable=False),
        sa.Column("collected_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["user.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_market_order_collected_at"), "market_order", ["collected_at"], unique=False
    )
    op.create_index(op.f("ix_market_order_item_id"), "market_order", ["item_id"], unique=False)
    op.create_index(
        "ix_market_order_item_location_quality",
        "market_order",
        ["item_id", "location_id", "quality_level"],
        unique=False,
    )
    op.create_index(
        op.f("ix_market_order_location_id"), "market_order", ["location_id"], unique=False
    )
    op.create_index(op.f("ix_market_order_user_id"), "market_order", ["user_id"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_market_order_user_id"), table_name="market_order")
    op.drop_index(op.f("ix_market_order_location_id"), table_name="market_order")
    op.drop_index("ix_market_order_item_location_quality", table_name="market_order")
    op.drop_index(op.f("ix_market_order_item_id"), table_name="market_order")
    op.drop_index(op.f("ix_market_order_collected_at"), table_name="market_order")
    op.drop_table("market_order")
