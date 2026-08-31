"""adicionar hierarquia de categorias do mercado"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "b3e4f5a6c7d8"
down_revision: str | None = "a2d7e8f9b0c1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("item", sa.Column("shop_subcategory2", sa.String(length=64), nullable=True))
    op.add_column("item", sa.Column("shop_subcategory3", sa.String(length=64), nullable=True))


def downgrade() -> None:
    op.drop_column("item", "shop_subcategory3")
    op.drop_column("item", "shop_subcategory2")
