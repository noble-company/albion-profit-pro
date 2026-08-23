"""add recipe tables

Revision ID: 1d33a63d1f3d
Revises: 8c2b0770b34d
Create Date: 2026-08-21 22:18:06.698405

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "1d33a63d1f3d"
down_revision: Union[str, Sequence[str], None] = "8c2b0770b34d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "recipe",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("output_item_unique_name", sa.String(length=64), nullable=False),
        sa.Column("output_item_id", sa.BigInteger(), nullable=True),
        sa.Column("silver_cost", sa.Integer(), nullable=False),
        sa.Column("crafting_focus", sa.Integer(), nullable=False),
        sa.Column("amount_crafted", sa.Integer(), nullable=False),
        sa.Column("craft_time", sa.Numeric(precision=10, scale=5), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_recipe_output_item_id"), "recipe", ["output_item_id"], unique=False)
    op.create_index(
        op.f("ix_recipe_output_item_unique_name"),
        "recipe",
        ["output_item_unique_name"],
        unique=True,
    )
    op.create_table(
        "recipe_ingredient",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("recipe_id", sa.Uuid(), nullable=False),
        sa.Column("ingredient_unique_name", sa.String(length=64), nullable=False),
        sa.Column("ingredient_item_id", sa.BigInteger(), nullable=True),
        sa.Column("count", sa.Integer(), nullable=False),
        sa.Column("enchantment_level", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["recipe_id"],
            ["recipe.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_recipe_ingredient_ingredient_unique_name"),
        "recipe_ingredient",
        ["ingredient_unique_name"],
        unique=False,
    )
    op.create_index(
        op.f("ix_recipe_ingredient_recipe_id"), "recipe_ingredient", ["recipe_id"], unique=False
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_recipe_ingredient_recipe_id"), table_name="recipe_ingredient")
    op.drop_index(
        op.f("ix_recipe_ingredient_ingredient_unique_name"), table_name="recipe_ingredient"
    )
    op.drop_table("recipe_ingredient")
    op.drop_index(op.f("ix_recipe_output_item_unique_name"), table_name="recipe")
    op.drop_index(op.f("ix_recipe_output_item_id"), table_name="recipe")
    op.drop_table("recipe")
