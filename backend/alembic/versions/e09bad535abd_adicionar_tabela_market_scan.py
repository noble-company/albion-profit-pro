"""adicionar tabela market_scan

Revision ID: e09bad535abd
Revises: 095b95179d56
Create Date: 2026-08-22 18:01:50.150817

"""

from typing import Sequence, Union

import fastapi_users_db_sqlalchemy
import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e09bad535abd"
down_revision: Union[str, Sequence[str], None] = "095b95179d56"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "market_scan",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", fastapi_users_db_sqlalchemy.generics.GUID(), nullable=False),
        sa.Column("item_key", sa.String(length=64), nullable=False),
        sa.Column("location_id", sa.String(length=64), nullable=False),
        sa.Column("quality_level", sa.Integer(), nullable=False),
        sa.Column("fonte", sa.String(length=16), nullable=False),
        sa.Column(
            "primeira_em",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "ultima_em", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column("n_varreduras", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["user.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id", "item_key", "location_id", "quality_level", "fonte", name="uq_market_scan"
        ),
    )
    op.create_index(op.f("ix_market_scan_item_key"), "market_scan", ["item_key"], unique=False)
    op.create_index(op.f("ix_market_scan_ultima_em"), "market_scan", ["ultima_em"], unique=False)
    op.create_index(op.f("ix_market_scan_user_id"), "market_scan", ["user_id"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_market_scan_user_id"), table_name="market_scan")
    op.drop_index(op.f("ix_market_scan_ultima_em"), table_name="market_scan")
    op.drop_index(op.f("ix_market_scan_item_key"), table_name="market_scan")
    op.drop_table("market_scan")
