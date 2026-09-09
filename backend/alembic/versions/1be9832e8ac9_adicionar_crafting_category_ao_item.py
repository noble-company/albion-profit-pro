"""adicionar crafting_category ao item

`@craftingcategory` do ITEM DUMP é o ramo do Painel do Destino (task 4/17): `T5_CLOTH` tem
"fiber", `T5_MAIN_CURSEDSTAFF` tem "cursestaff". É a chave que liga um item ao nó de
especialização que reduz o custo de foco dele — sem ela, o cliente precisaria de um mapa
escrito à mão, que apodrece no primeiro patch do jogo.

O autogenerate também quis **derrubar** `ix_item_busca_normalizada_trgm`: ele não reconhece o
índice GIN com `gin_trgm_ops` criado à mão e o lê como sobra. Removido daqui de propósito —
esse índice é a busca por texto do produto.

Revision ID: 1be9832e8ac9
Revises: b8e1d3f5a2c7
Create Date: 2026-09-09 11:01:37.236642

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "1be9832e8ac9"
down_revision: str | Sequence[str] | None = "b8e1d3f5a2c7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("item", sa.Column("crafting_category", sa.String(length=64), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("item", "crafting_category")
