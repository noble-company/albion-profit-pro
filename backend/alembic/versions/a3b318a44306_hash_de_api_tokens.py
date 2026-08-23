"""hash de api tokens

Revision ID: a3b318a44306
Revises: 81de3361cd01
Create Date: 2026-08-22 20:37:10.112100

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a3b318a44306"
down_revision: Union[str, Sequence[str], None] = "81de3361cd01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Task 32, achado A1: `token` cru sai do banco. `token_hash`/`token_sufixo` entram
    nullable primeiro de propósito -- são preenchidos a partir do `token` cru que AINDA
    existe na tabela (sha256 nativo do Postgres, 11+; temos 16), só então viram NOT NULL.
    Nenhum token em uso é invalidado por essa migração."""
    op.add_column("api_token", sa.Column("token_hash", sa.String(length=64), nullable=True))
    op.add_column("api_token", sa.Column("token_sufixo", sa.String(length=8), nullable=True))
    op.add_column("api_token", sa.Column("nome", sa.String(length=64), nullable=True))
    op.add_column(
        "api_token", sa.Column("ultimo_uso_em", sa.DateTime(timezone=True), nullable=True)
    )

    op.execute(
        "UPDATE api_token SET token_hash = encode(sha256(token::bytea), 'hex'), "
        "token_sufixo = right(token, 4)"
    )

    op.alter_column("api_token", "token_hash", nullable=False)
    op.alter_column("api_token", "token_sufixo", nullable=False)

    op.drop_index(op.f("ix_api_token_token"), table_name="api_token")
    op.create_index(op.f("ix_api_token_token_hash"), "api_token", ["token_hash"], unique=True)
    op.drop_column("api_token", "token")


def downgrade() -> None:
    """Não dá pra derivar o valor cru a partir do hash -- `token` volta nullable (vazio),
    não NOT NULL como no schema original, porque não há dado real pra popular."""
    op.add_column("api_token", sa.Column("token", sa.VARCHAR(length=64), nullable=True))
    op.drop_index(op.f("ix_api_token_token_hash"), table_name="api_token")
    op.create_index(op.f("ix_api_token_token"), "api_token", ["token"], unique=True)
    op.drop_column("api_token", "ultimo_uso_em")
    op.drop_column("api_token", "nome")
    op.drop_column("api_token", "token_sufixo")
    op.drop_column("api_token", "token_hash")
