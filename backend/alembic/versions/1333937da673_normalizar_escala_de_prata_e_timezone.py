"""normalizar escala de prata e timezone

Revision ID: 1333937da673
Revises: 42c9111202e7
Create Date: 2026-08-22 16:06:40.983006

"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "1333937da673"
down_revision: Union[str, Sequence[str], None] = "42c9111202e7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.alter_column(
        "api_token",
        "created_at",
        existing_type=postgresql.TIMESTAMP(),
        type_=sa.DateTime(timezone=True),
        existing_nullable=False,
        existing_server_default=sa.text("now()"),
    )
    op.alter_column(
        "api_token",
        "revoked_at",
        existing_type=postgresql.TIMESTAMP(),
        type_=sa.DateTime(timezone=True),
        existing_nullable=True,
    )
    op.alter_column(
        "market_history_entry",
        "silver_amount",
        existing_type=sa.BIGINT(),
        type_=sa.Numeric(precision=20, scale=4),
        existing_nullable=False,
    )
    op.alter_column(
        "market_history_entry",
        "collected_at",
        existing_type=postgresql.TIMESTAMP(),
        type_=sa.DateTime(timezone=True),
        existing_nullable=False,
        existing_server_default=sa.text("now()"),
    )
    op.alter_column(
        "market_order",
        "unit_price_silver",
        existing_type=sa.BIGINT(),
        type_=sa.Numeric(precision=18, scale=4),
        existing_nullable=False,
    )
    # sem dado de producao nas tabelas de mercado ainda (ver task 25) — nao ha string real
    # pra converter, mas o Postgres exige um USING explicito pra sair de varchar
    op.alter_column(
        "market_order",
        "expires",
        existing_type=sa.VARCHAR(length=32),
        type_=sa.DateTime(timezone=True),
        existing_nullable=False,
        postgresql_using="expires::timestamp with time zone",
    )
    op.alter_column(
        "market_order",
        "collected_at",
        existing_type=postgresql.TIMESTAMP(),
        type_=sa.DateTime(timezone=True),
        existing_nullable=False,
        existing_server_default=sa.text("now()"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.alter_column(
        "market_order",
        "collected_at",
        existing_type=sa.DateTime(timezone=True),
        type_=postgresql.TIMESTAMP(),
        existing_nullable=False,
        existing_server_default=sa.text("now()"),
    )
    op.alter_column(
        "market_order",
        "expires",
        existing_type=sa.DateTime(timezone=True),
        type_=sa.VARCHAR(length=32),
        existing_nullable=False,
        postgresql_using="expires::text",
    )
    op.alter_column(
        "market_order",
        "unit_price_silver",
        existing_type=sa.Numeric(precision=18, scale=4),
        type_=sa.BIGINT(),
        existing_nullable=False,
    )
    op.alter_column(
        "market_history_entry",
        "collected_at",
        existing_type=sa.DateTime(timezone=True),
        type_=postgresql.TIMESTAMP(),
        existing_nullable=False,
        existing_server_default=sa.text("now()"),
    )
    op.alter_column(
        "market_history_entry",
        "silver_amount",
        existing_type=sa.Numeric(precision=20, scale=4),
        type_=sa.BIGINT(),
        existing_nullable=False,
    )
    op.alter_column(
        "api_token",
        "revoked_at",
        existing_type=sa.DateTime(timezone=True),
        type_=postgresql.TIMESTAMP(),
        existing_nullable=True,
    )
    op.alter_column(
        "api_token",
        "created_at",
        existing_type=sa.DateTime(timezone=True),
        type_=postgresql.TIMESTAMP(),
        existing_nullable=False,
        existing_server_default=sa.text("now()"),
    )
