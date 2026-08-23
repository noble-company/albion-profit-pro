"""criar tabelas item e location

Revision ID: 095b95179d56
Revises: 2a61cb833442
Create Date: 2026-08-22 16:54:09.734119

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "095b95179d56"
down_revision: Union[str, Sequence[str], None] = "2a61cb833442"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "item",
        sa.Column("unique_name", sa.String(length=64), nullable=False),
        sa.Column("albion_id", sa.BigInteger(), nullable=True),
        sa.Column("name_pt", sa.String(length=255), nullable=True),
        sa.Column("name_en", sa.String(length=255), nullable=True),
        sa.Column("tier", sa.Integer(), nullable=True),
        sa.Column("enchantment_level", sa.Integer(), nullable=False),
        sa.Column("shop_category", sa.String(length=64), nullable=True),
        sa.Column("shop_subcategory", sa.String(length=64), nullable=True),
        sa.PrimaryKeyConstraint("unique_name"),
    )
    op.create_index(op.f("ix_item_albion_id"), "item", ["albion_id"], unique=True)
    op.create_table(
        "location",
        sa.Column("location_id", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=True),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("is_royal_city", sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint("location_id"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("location")
    op.drop_index(op.f("ix_item_albion_id"), table_name="item")
    op.drop_table("item")
