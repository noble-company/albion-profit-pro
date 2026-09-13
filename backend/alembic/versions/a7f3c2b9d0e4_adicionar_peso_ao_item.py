"""adicionar peso ao item (lucro por peso do scanner, task 4/01)

Escrita à mão, não por `--autogenerate`. Motivo: `src/items/models.py` é o único módulo de
modelos sem `__table_args__` e não declara `ix_item_busca_normalizada_trgm` (GIN +
`gin_trgm_ops`, criado só na migração `f1c6d7e8f9a0:58-63`), então um `--autogenerate` sobre a
tabela `item` emite um `op.drop_index` espúrio desse índice. Ver o achado `E08` e a task 3.6/09,
que segue aberta.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a7f3c2b9d0e4"
down_revision: str | tuple[str, str] | None = "e6a1b2c3d4e5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Numeric, não Float: o peso entra na divisão `lucro / peso`, cujo resultado é exibido —
    # a regra F09 (dinheiro e derivados em decimal) vale pra toda aritmética que o usuário lê.
    # Nulo é legítimo: só 5.794 das 40.785 entradas do ITEM DUMP têm `@weight`.
    op.add_column("item", sa.Column("weight", sa.Numeric(precision=10, scale=4), nullable=True))


def downgrade() -> None:
    op.drop_column("item", "weight")
