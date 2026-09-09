"""adicionar price_snapshot (topo de livro em massa para o scanner, task 4/03)

Escrita à mão pelo mesmo motivo da `a7f3c2b9d0e4`: `--autogenerate` sobre este schema emite um
`op.drop_index` espúrio de `ix_item_busca_normalizada_trgm` (achado `E08`, task 3.6/09 aberta).
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "b8e1d3f5a2c7"
down_revision: str | tuple[str, str] | None = "a7f3c2b9d0e4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "price_snapshot",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("server_id", sa.String(length=16), nullable=False),
        sa.Column("item_id", sa.String(length=64), nullable=False),
        sa.Column("location_id", sa.String(length=64), nullable=False),
        sa.Column("quality_level", sa.Integer(), nullable=False),
        sa.Column("enchantment_level", sa.Integer(), nullable=False),
        sa.Column("sell_min", sa.Numeric(precision=18, scale=4), nullable=True),
        sa.Column("sell_observed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sell_source", sa.String(length=16), nullable=True),
        sa.Column("buy_max", sa.Numeric(precision=18, scale=4), nullable=True),
        sa.Column("buy_observed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("buy_source", sa.String(length=16), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "server_id IN ('west', 'east', 'europe')", name="ck_price_snapshot_server"
        ),
        sa.CheckConstraint("quality_level BETWEEN 1 AND 5", name="ck_price_snapshot_quality"),
        sa.CheckConstraint(
            "enchantment_level BETWEEN 0 AND 4", name="ck_price_snapshot_enchantment"
        ),
        sa.CheckConstraint(
            "sell_min IS NULL OR sell_min > 0", name="ck_price_snapshot_sell_positive"
        ),
        sa.CheckConstraint("buy_max IS NULL OR buy_max > 0", name="ck_price_snapshot_buy_positive"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "server_id",
            "item_id",
            "location_id",
            "quality_level",
            "enchantment_level",
            name="uq_price_snapshot_combo",
        ),
    )
    op.create_index("ix_price_snapshot_read", "price_snapshot", ["server_id", "location_id"])


def downgrade() -> None:
    op.drop_index("ix_price_snapshot_read", table_name="price_snapshot")
    op.drop_table("price_snapshot")
