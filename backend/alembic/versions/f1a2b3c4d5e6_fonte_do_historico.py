"""fonte do histórico de mercado (task 4/23)

`market_history_entry.source`: `client` (o nosso client, direto do servidor do jogo, com a prata
exata) ou `aodp` (a API pública do Albion Data Project, agregada e com preço médio arredondado).
No mesmo bloco de 6 h o client vence: o upsert da API pública só atualiza linha que já é `aodp`.

Padrão `client`: toda linha que existe hoje veio do nosso ingest.

Escrita à mão, não por `--autogenerate`, pelo mesmo motivo da `a7f3c2b9d0e4`: um autogenerate
emite um `op.drop_index` espúrio do `ix_item_busca_normalizada_trgm`. Ver o achado `E08`.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "f1a2b3c4d5e6"
down_revision: str | tuple[str, str] | None = "e8d9f0a1b2c3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "market_history_entry",
        sa.Column("source", sa.String(16), nullable=False, server_default="client"),
    )
    op.create_check_constraint(
        "ck_market_history_entry_source",
        "market_history_entry",
        "source IN ('client', 'aodp')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_market_history_entry_source", "market_history_entry", type_="check")
    op.drop_column("market_history_entry", "source")
