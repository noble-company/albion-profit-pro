"""adicionar production_kind a receita (refino x fabricacao por dado, B11)"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "e6a1b2c3d4e5"
down_revision: str | tuple[str, str] | None = "d5f8a9b0c1e2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "recipe",
        sa.Column(
            "production_kind",
            sa.String(length=16),
            nullable=False,
            server_default="crafting",
        ),
    )
    op.create_check_constraint(
        "ck_recipe_production_kind",
        "recipe",
        "production_kind IN ('refining', 'crafting')",
    )
    op.create_index("ix_recipe_production_kind", "recipe", ["production_kind"], unique=False)
    # O valor correto vem da reexecução do seed (transform_revision novo). Instalações que não
    # reseedam ficam com 'crafting' — seguro: nada aparece como refino por engano.


def downgrade() -> None:
    op.drop_index("ix_recipe_production_kind", table_name="recipe")
    op.drop_constraint("ck_recipe_production_kind", "recipe", type_="check")
    op.drop_column("recipe", "production_kind")
