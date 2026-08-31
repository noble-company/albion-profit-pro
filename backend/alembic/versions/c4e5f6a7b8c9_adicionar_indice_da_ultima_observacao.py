"""adicionar indice para projecao da ultima observacao"""

from collections.abc import Sequence

from alembic import op

revision: str = "c4e5f6a7b8c9"
down_revision: str | tuple[str, str] | None = "f2d7e8f9a0b1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "ix_market_order_latest_observation",
        "market_order",
        [
            "server_id",
            "item_id",
            "location_id",
            "quality_level",
            "enchantment_level",
            "auction_type",
            "last_seen_at",
        ],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_market_order_latest_observation", table_name="market_order")
