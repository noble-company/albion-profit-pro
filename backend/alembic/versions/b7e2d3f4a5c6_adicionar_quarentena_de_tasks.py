"""adicionar quarentena de tasks

Revision ID: b7e2d3f4a5c6
Revises: a3b318a44306
Create Date: 2026-08-23

"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "b7e2d3f4a5c6"
down_revision: Union[str, Sequence[str], None] = "a3b318a44306"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "quarantined_task",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("celery_task_id", sa.String(length=64), nullable=False),
        sa.Column("task_name", sa.String(length=128), nullable=False),
        sa.Column("failure_kind", sa.String(length=32), nullable=False),
        sa.Column("topic", sa.String(length=64), nullable=True),
        sa.Column("user_id", sa.Uuid(), nullable=True),
        sa.Column("api_token_id", sa.Uuid(), nullable=True),
        sa.Column("realm", sa.String(length=16), nullable=True),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("error_type", sa.String(length=256), nullable=False),
        sa.Column("error_summary", sa.Text(), nullable=False),
        sa.Column("traceback", sa.Text(), nullable=True),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("payload_sha256", sa.String(length=64), nullable=True),
        sa.Column("status", sa.String(length=24), server_default="pending", nullable=False),
        sa.Column(
            "failed_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column("requeued_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_quarantined_task_celery_task_id"),
        "quarantined_task",
        ["celery_task_id"],
        unique=True,
    )
    op.create_index(
        op.f("ix_quarantined_task_failed_at"), "quarantined_task", ["failed_at"], unique=False
    )
    op.create_index(
        op.f("ix_quarantined_task_payload_sha256"),
        "quarantined_task",
        ["payload_sha256"],
        unique=False,
    )
    op.create_index(
        op.f("ix_quarantined_task_task_name"), "quarantined_task", ["task_name"], unique=False
    )
    op.create_index(
        op.f("ix_quarantined_task_user_id"), "quarantined_task", ["user_id"], unique=False
    )
    op.create_index(
        "ix_quarantined_task_status_failed_at",
        "quarantined_task",
        ["status", "failed_at"],
        unique=False,
    )

    op.create_table(
        "quarantine_replay",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("quarantined_task_id", sa.Uuid(), nullable=False),
        sa.Column("actor", sa.String(length=128), nullable=False),
        sa.Column("dispatched_task_id", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("error_summary", sa.Text(), nullable=True),
        sa.Column(
            "requested_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("dispatched_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["quarantined_task_id"], ["quarantined_task.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("dispatched_task_id"),
    )
    op.create_index(
        op.f("ix_quarantine_replay_quarantined_task_id"),
        "quarantine_replay",
        ["quarantined_task_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_quarantine_replay_quarantined_task_id"), table_name="quarantine_replay")
    op.drop_table("quarantine_replay")
    op.drop_index("ix_quarantined_task_status_failed_at", table_name="quarantined_task")
    op.drop_index(op.f("ix_quarantined_task_user_id"), table_name="quarantined_task")
    op.drop_index(op.f("ix_quarantined_task_task_name"), table_name="quarantined_task")
    op.drop_index(op.f("ix_quarantined_task_payload_sha256"), table_name="quarantined_task")
    op.drop_index(op.f("ix_quarantined_task_failed_at"), table_name="quarantined_task")
    op.drop_index(op.f("ix_quarantined_task_celery_task_id"), table_name="quarantined_task")
    op.drop_table("quarantined_task")
