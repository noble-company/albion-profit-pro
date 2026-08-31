"""adicionar posição aos ingredientes

Revision ID: a2d7e8f9b0c1
Revises: f1c6d7e8f9a0
Create Date: 2026-08-23
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a2d7e8f9b0c1"
down_revision: str | None = "f1c6d7e8f9a0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("recipe_ingredient", sa.Column("position", sa.Integer(), nullable=True))
    op.execute(
        """
        WITH ordered AS (
            SELECT
                id,
                row_number() OVER (
                    PARTITION BY recipe_id
                    ORDER BY ingredient_unique_name, enchantment_level, count, id
                ) - 1 AS position
            FROM recipe_ingredient
        )
        UPDATE recipe_ingredient AS ingredient
        SET position = ordered.position
        FROM ordered
        WHERE ingredient.id = ordered.id
        """
    )
    missing = op.get_bind().scalar(
        sa.text("SELECT count(*) FROM recipe_ingredient WHERE position IS NULL")
    )
    if missing:
        raise RuntimeError(f"Backfill de posição deixou {missing} ingredientes sem valor")
    op.alter_column(
        "recipe_ingredient",
        "position",
        existing_type=sa.Integer(),
        nullable=False,
    )
    op.create_check_constraint(
        "ck_recipe_ingredient_position_nonnegative",
        "recipe_ingredient",
        "position >= 0",
    )
    op.create_unique_constraint(
        "uq_recipe_ingredient_position",
        "recipe_ingredient",
        ["recipe_id", "position"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_recipe_ingredient_position", "recipe_ingredient", type_="unique")
    op.drop_constraint(
        "ck_recipe_ingredient_position_nonnegative",
        "recipe_ingredient",
        type_="check",
    )
    op.drop_column("recipe_ingredient", "position")
