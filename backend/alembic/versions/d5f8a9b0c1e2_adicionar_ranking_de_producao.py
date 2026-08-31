"""adicionar tabelas de ranking de producao materializado"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "d5f8a9b0c1e2"
down_revision: str | tuple[str, str] | None = "c4e5f6a7b8c9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "recipe_ranking",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("server_id", sa.String(length=16), nullable=False),
        sa.Column("output_item_unique_name", sa.String(length=64), nullable=False),
        sa.Column("location_id", sa.String(length=64), nullable=False),
        sa.Column("output_quality", sa.Integer(), nullable=False),
        sa.Column("enchantment_level", sa.Integer(), nullable=False),
        sa.Column("tier", sa.Integer(), nullable=True),
        sa.Column("is_refining", sa.Boolean(), nullable=False),
        sa.Column("recipe_silver_cost", sa.Integer(), nullable=False),
        sa.Column("crafting_focus", sa.Integer(), nullable=False),
        sa.Column("amount_crafted", sa.Integer(), nullable=False),
        sa.Column("executions", sa.Integer(), nullable=False),
        sa.Column("produced_quantity", sa.Integer(), nullable=False),
        sa.Column("ingredient_cost_immediate", sa.Numeric(18, 4), nullable=True),
        sa.Column("ingredient_cost_order", sa.Numeric(18, 4), nullable=True),
        sa.Column("output_gross_immediate", sa.Numeric(18, 4), nullable=True),
        sa.Column("output_gross_order", sa.Numeric(18, 4), nullable=True),
        sa.Column("ingredients", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("ingredients_oldest_observed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("output_immediate_observed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("output_order_observed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("warnings", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("neutral_profit", sa.Numeric(18, 4), nullable=True),
        sa.Column("neutral_roi", sa.Numeric(18, 4), nullable=True),
        sa.Column(
            "computed_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "server_id IN ('west', 'east', 'europe')", name="ck_recipe_ranking_server"
        ),
        sa.CheckConstraint("output_quality BETWEEN 1 AND 5", name="ck_recipe_ranking_quality"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "server_id",
            "output_item_unique_name",
            "location_id",
            "output_quality",
            name="uq_recipe_ranking",
        ),
    )
    op.create_index(
        "ix_recipe_ranking_order",
        "recipe_ranking",
        ["server_id", "is_refining", "neutral_profit"],
        unique=False,
    )
    op.create_index(
        "ix_recipe_ranking_filters",
        "recipe_ranking",
        ["server_id", "is_refining", "tier", "enchantment_level", "output_quality"],
        unique=False,
    )
    op.create_index(
        "ix_recipe_ranking_location",
        "recipe_ranking",
        ["server_id", "is_refining", "location_id"],
        unique=False,
    )

    op.create_table(
        "recipe_ranking_run",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("server_id", sa.String(length=16), nullable=False),
        sa.Column(
            "computed_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("duration_ms", sa.Integer(), nullable=False),
        sa.Column("evaluated_recipes", sa.Integer(), nullable=False),
        sa.Column("priced_recipes", sa.Integer(), nullable=False),
        sa.Column("total_recipes", sa.Integer(), nullable=False),
        sa.Column("ranking_rows", sa.Integer(), nullable=False),
        sa.CheckConstraint(
            "server_id IN ('west', 'east', 'europe')", name="ck_recipe_ranking_run_server"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("server_id", name="uq_recipe_ranking_run_server"),
    )


def downgrade() -> None:
    op.drop_table("recipe_ranking_run")
    op.drop_index("ix_recipe_ranking_location", table_name="recipe_ranking")
    op.drop_index("ix_recipe_ranking_filters", table_name="recipe_ranking")
    op.drop_index("ix_recipe_ranking_order", table_name="recipe_ranking")
    op.drop_table("recipe_ranking")
