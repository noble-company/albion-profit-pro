"""add enchantment fields to recipe

Revision ID: 42c9111202e7
Revises: 1d33a63d1f3d
Create Date: 2026-08-21 23:24:53.455232

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "42c9111202e7"
down_revision: Union[str, Sequence[str], None] = "1d33a63d1f3d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # server_default necessário: a tabela `recipe` já tem linhas (populada pela
    # task 19) — sem default, o ALTER TABLE ADD COLUMN NOT NULL falha porque as
    # linhas existentes ficariam com valor nulo. Removido depois de aplicado
    # (a coluna no model usa default=0 no lado do Python daqui pra frente, não
    # precisa do default do servidor pra INSERTs futuros).
    op.add_column(
        "recipe",
        sa.Column("enchantment_level", sa.Integer(), nullable=False, server_default="0"),
    )
    op.alter_column("recipe", "enchantment_level", server_default=None)
    op.add_column(
        "recipe", sa.Column("upgrade_resource_unique_name", sa.String(length=64), nullable=True)
    )
    op.add_column("recipe", sa.Column("upgrade_resource_item_id", sa.BigInteger(), nullable=True))
    op.add_column("recipe", sa.Column("upgrade_resource_count", sa.Integer(), nullable=True))
    op.create_index(
        op.f("ix_recipe_enchantment_level"), "recipe", ["enchantment_level"], unique=False
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_recipe_enchantment_level"), table_name="recipe")
    op.drop_column("recipe", "upgrade_resource_count")
    op.drop_column("recipe", "upgrade_resource_item_id")
    op.drop_column("recipe", "upgrade_resource_unique_name")
    op.drop_column("recipe", "enchantment_level")
