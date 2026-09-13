"""marca de retorno por ingrediente (task 4/26)

`recipe_ingredient.return_eligible`: o jogo não devolve artefato, cristal, token, capa base e afins
no retorno de recurso, e o dump marca esses ingredientes com `@maxreturnamount="0"`. Sem a marca,
cliente e servidor aplicavam o retorno à receita inteira.

Padrão verdadeiro, que é o comportamento de antes. O valor certo vem da reexecução do seed: o
`transform_revision` subiu junto, e o seed só reaplica quando o manifesto muda.

Escrita à mão, não por `--autogenerate`, pelo mesmo motivo da `a7f3c2b9d0e4`: um autogenerate
emite um `op.drop_index` espúrio do `ix_item_busca_normalizada_trgm`. Ver o achado `E08`.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "e8d9f0a1b2c3"
down_revision: str | tuple[str, str] | None = "d6b7c8e9f0a1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "recipe_ingredient",
        sa.Column("return_eligible", sa.Boolean(), nullable=False, server_default=sa.true()),
    )


def downgrade() -> None:
    op.drop_column("recipe_ingredient", "return_eligible")
