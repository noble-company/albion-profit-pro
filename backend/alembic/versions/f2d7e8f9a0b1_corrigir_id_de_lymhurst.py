"""Corrige o ID de mercado usado pelo client para Lymhurst."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "f2d7e8f9a0b1"
down_revision: tuple[str, str] = ("b3e4f5a6c7d8", "f1c6d7e8f9a0")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    location = sa.table(
        "location",
        sa.column("location_id", sa.String),
        sa.column("name", sa.String),
        sa.column("kind", sa.String),
        sa.column("is_royal_city", sa.Boolean),
    )
    op.execute(
        location.update()
        .where(location.c.location_id == "1301")
        .values(name="Lymhurst", kind="city", is_royal_city=True)
    )
    op.execute(
        sa.text(
            """
            INSERT INTO location (location_id, name, kind, is_royal_city)
            SELECT '1301', 'Lymhurst', 'city', TRUE
            WHERE NOT EXISTS (SELECT 1 FROM location WHERE location_id = '1301')
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text("UPDATE location SET name = NULL, is_royal_city = FALSE WHERE location_id = '1301'")
    )
