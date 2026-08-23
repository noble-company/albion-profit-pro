"""reforçar contrato de ingest

Revision ID: d9a4f5b6c7e8
Revises: c8f3e4a5b6d7
Create Date: 2026-08-23
"""

from collections.abc import Sequence

from alembic import op

revision: str = "d9a4f5b6c7e8"
down_revision: str | None = "c8f3e4a5b6d7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

CONSTRAINTS = {
    "market_order": {
        "ck_market_order_source_positive": "source_id > 0",
        "ck_market_order_item_not_empty": "length(item_id) > 0",
        "ck_market_order_location_not_empty": "length(location_id) > 0",
        "ck_market_order_quality": "quality_level BETWEEN 1 AND 5",
        "ck_market_order_enchantment": "enchantment_level BETWEEN 0 AND 4",
        "ck_market_order_price_positive": "unit_price_silver > 0",
        "ck_market_order_amount_positive": "amount > 0",
        "ck_market_order_auction_type": "auction_type IN ('offer', 'request')",
    },
    "market_history_entry": {
        "ck_market_history_entry_item_positive": "item_id > 0",
        "ck_market_history_entry_location_not_empty": "length(location_id) > 0",
        "ck_market_history_entry_quality": "quality_level BETWEEN 1 AND 5",
        "ck_market_history_entry_bucket_seconds": "bucket_seconds IN (3600, 21600)",
        "ck_market_history_entry_amount_nonnegative": "item_amount >= 0",
        "ck_market_history_entry_silver_nonnegative": "silver_amount >= 0",
    },
    "market_scan": {
        "ck_market_scan_item_not_empty": "length(item_key) > 0",
        "ck_market_scan_location_not_empty": "length(location_id) > 0",
        "ck_market_scan_quality": "quality_level BETWEEN 1 AND 5",
        "ck_market_scan_fonte": "fonte IN ('livro', 'historico')",
    },
}


def upgrade() -> None:
    for table_name, constraints in CONSTRAINTS.items():
        for constraint_name, condition in constraints.items():
            op.create_check_constraint(constraint_name, table_name, condition)


def downgrade() -> None:
    for table_name, constraints in reversed(CONSTRAINTS.items()):
        for constraint_name in reversed(constraints):
            op.drop_constraint(constraint_name, table_name, type_="check")
