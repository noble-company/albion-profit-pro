"""adicionar busca normalizada de itens

Revision ID: f1c6d7e8f9a0
Revises: e0b5c6d7e8f9
Create Date: 2026-08-23
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op
from src.items.normalization import normalize_item_search

revision: str = "f1c6d7e8f9a0"
down_revision: str | None = "e0b5c6d7e8f9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.add_column("item", sa.Column("busca_normalizada", sa.Text(), nullable=True))

    connection = op.get_bind()
    items = connection.execute(sa.text("SELECT unique_name, name_pt, name_en FROM item")).mappings()
    updates = [
        {
            "unique_name": item["unique_name"],
            "busca_normalizada": normalize_item_search(
                item["unique_name"], item["name_pt"], item["name_en"]
            ),
        }
        for item in items
    ]
    if updates:
        connection.execute(
            sa.text(
                "UPDATE item SET busca_normalizada = :busca_normalizada "
                "WHERE unique_name = :unique_name"
            ),
            updates,
        )

    missing = connection.scalar(
        sa.text("SELECT count(*) FROM item WHERE busca_normalizada IS NULL")
    )
    if missing:
        raise RuntimeError(f"Backfill de busca deixou {missing} itens sem valor")

    op.alter_column(
        "item",
        "busca_normalizada",
        existing_type=sa.Text(),
        nullable=False,
        server_default=sa.text("''"),
    )
    op.create_index(
        "ix_item_busca_normalizada_trgm",
        "item",
        ["busca_normalizada"],
        postgresql_using="gin",
        postgresql_ops={"busca_normalizada": "gin_trgm_ops"},
    )


def downgrade() -> None:
    op.drop_index("ix_item_busca_normalizada_trgm", table_name="item")
    op.drop_column("item", "busca_normalizada")
