"""adicionar receitas salvas por usuário e realm (scanner A06)

Revision ID: a06c4f7e2b19
Revises: f1a2b3c4d5e6
Create Date: 2026-09-14
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a06c4f7e2b19"
down_revision: str | tuple[str, str] | None = "f1a2b3c4d5e6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "saved_craft",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("server", sa.String(length=8), nullable=False),
        sa.Column("output_item", sa.String(length=64), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("output_quality", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "output_quality >= 1 AND output_quality <= 5",
            name="ck_saved_craft_output_quality",
        ),
        sa.CheckConstraint("quantity >= 1 AND quantity <= 1000000", name="ck_saved_craft_quantity"),
        sa.CheckConstraint("server IN ('west', 'east', 'europe')", name="ck_saved_craft_server"),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_saved_craft_user_id", "saved_craft", ["user_id"], unique=False)
    op.create_index(
        "ix_saved_craft_user_server_updated",
        "saved_craft",
        ["user_id", "server", "updated_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_saved_craft_user_server_updated", table_name="saved_craft")
    op.drop_index("ix_saved_craft_user_id", table_name="saved_craft")
    op.drop_table("saved_craft")
