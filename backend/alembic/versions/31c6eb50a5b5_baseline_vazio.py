"""baseline vazio

Revision ID: 31c6eb50a5b5
Revises:
Create Date: 2026-08-21 21:31:55.258417

"""

from typing import Sequence, Union

# revision identifiers, used by Alembic.
revision: str = "31c6eb50a5b5"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
