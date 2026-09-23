"""Corrige o ID de mercado usado pelo client para Lymhurst."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "f2d7e8f9a0b1"
# PATCH (task 3.6/17, P09): nunca existiram dois heads pra juntar -- `f1c6d7e8f9a0` já é
# ancestral de `b3e4f5a6c7d8` (duas migrações antes: b3e4f5a6c7d8 -> a2d7e8f9b0c1 ->
# f1c6d7e8f9a0). O `down_revision` de merge escrito à mão deixava `downgrade` percorrer um
# ramo fantasma; o pai único correto já cobre a mesma ancestralidade.
down_revision: str = "b3e4f5a6c7d8"
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
