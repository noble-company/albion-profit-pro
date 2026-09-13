"""adicionar valor ao item (taxa da estação por nutrição, task 4/18)

Escrita à mão, não por `--autogenerate`, pelo mesmo motivo da `a7f3c2b9d0e4`:
`src/items/models.py` não declara `ix_item_busca_normalizada_trgm` (GIN + `gin_trgm_ops`,
criado só em `f1c6d7e8f9a0`), então um `--autogenerate` sobre `item` emite um `op.drop_index`
espúrio desse índice. Ver o achado `E08` e a task 3.6/09.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "c4a5b6d7e8f0"
down_revision: str | tuple[str, str] | None = "e59e948c3779"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # A base da taxa da estação: o jogo cobra por nutrição consumida, e
    # `nutrição = item_value × 0,1125`. Numeric e não Float porque o valor entra numa
    # multiplicação cujo resultado o usuário lê como prata cobrada (`F09`).
    #
    # Escala 4: o dump publica valores fracionários (`T8_HIDE` vale 25,6). Precisão 14 cobre com
    # folga o maior derivado do catálogo (o machado T8 Avalon, 38.912).
    #
    # Nulo é legítimo: 538 receitas — os trade packs de facção — são feitas de tokens que não
    # têm valor em ponto nenhum da cadeia. Zero ali seria uma taxa inventada.
    op.add_column("item", sa.Column("item_value", sa.Numeric(precision=14, scale=4), nullable=True))


def downgrade() -> None:
    op.drop_column("item", "item_value")
