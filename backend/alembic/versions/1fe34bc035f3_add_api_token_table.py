"""add api_token table

Revision ID: 1fe34bc035f3
Revises: 6354588e51ce
Create Date: 2026-08-21 21:49:09.910490

"""

from typing import Sequence, Union

import fastapi_users_db_sqlalchemy
import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "1fe34bc035f3"
down_revision: Union[str, Sequence[str], None] = "6354588e51ce"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "api_token",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", fastapi_users_db_sqlalchemy.generics.GUID(), nullable=False),
        sa.Column("token", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["user.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_api_token_token"), "api_token", ["token"], unique=True)
    op.create_index(op.f("ix_api_token_user_id"), "api_token", ["user_id"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_api_token_user_id"), table_name="api_token")
    op.drop_index(op.f("ix_api_token_token"), table_name="api_token")
    op.drop_table("api_token")
