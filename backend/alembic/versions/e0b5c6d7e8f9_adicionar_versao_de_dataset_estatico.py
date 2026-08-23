"""adicionar versão de dataset estático

Revision ID: e0b5c6d7e8f9
Revises: d9a4f5b6c7e8
Create Date: 2026-08-23
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "e0b5c6d7e8f9"
down_revision: str | None = "d9a4f5b6c7e8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "static_dataset_version",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("dataset_name", sa.String(length=64), nullable=False),
        sa.Column("version", sa.String(length=128), nullable=False),
        sa.Column("source_revision", sa.String(length=64), nullable=False),
        sa.Column("manifest_sha256", sa.String(length=64), nullable=False),
        sa.Column("items_sha256", sa.String(length=64), nullable=False),
        sa.Column("item_dump_sha256", sa.String(length=64), nullable=False),
        sa.Column("item_count", sa.Integer(), nullable=False),
        sa.Column("recipe_count", sa.Integer(), nullable=False),
        sa.Column("skipped_recipe_count", sa.Integer(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column(
            "applied_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("item_count >= 0", name="ck_static_dataset_item_count"),
        sa.CheckConstraint("recipe_count >= 0", name="ck_static_dataset_recipe_count"),
        sa.CheckConstraint("skipped_recipe_count >= 0", name="ck_static_dataset_skipped_count"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("dataset_name", "manifest_sha256", name="uq_static_dataset_manifest"),
    )
    op.create_index(
        "uq_static_dataset_active",
        "static_dataset_version",
        ["dataset_name"],
        unique=True,
        postgresql_where=sa.text("active"),
    )


def downgrade() -> None:
    op.drop_index("uq_static_dataset_active", table_name="static_dataset_version")
    op.drop_table("static_dataset_version")
