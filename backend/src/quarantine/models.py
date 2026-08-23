import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from src.database import Base


class QuarantinedTask(Base):
    """Falha definitiva observável e reprocessável sem depender do result backend."""

    __tablename__ = "quarantined_task"
    __table_args__ = (Index("ix_quarantined_task_status_failed_at", "status", "failed_at"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    celery_task_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    task_name: Mapped[str] = mapped_column(String(128), index=True)
    failure_kind: Mapped[str] = mapped_column(String(32))  # ingest | maintenance
    topic: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # Identificadores operacionais, nunca o token cru. Não são FKs para que a trilha de
    # auditoria sobreviva à remoção futura de usuário/token.
    user_id: Mapped[uuid.UUID | None] = mapped_column(nullable=True, index=True)
    api_token_id: Mapped[uuid.UUID | None] = mapped_column(nullable=True)
    # Nullable apenas para preservar falhas legadas anteriores ao contrato multi-realm.
    realm: Mapped[str | None] = mapped_column(String(16), nullable=True)

    attempts: Mapped[int] = mapped_column(Integer)
    error_type: Mapped[str] = mapped_column(String(256))
    error_summary: Mapped[str] = mapped_column(Text)
    traceback: Mapped[str | None] = mapped_column(Text, nullable=True)
    payload: Mapped[dict | list | None] = mapped_column(JSONB, nullable=True)
    payload_sha256: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)

    status: Mapped[str] = mapped_column(String(24), default="pending", server_default="pending")
    failed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    requeued_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class QuarantineReplay(Base):
    """Uma tentativa auditável de republicar uma falha da quarentena."""

    __tablename__ = "quarantine_replay"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    quarantined_task_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("quarantined_task.id", ondelete="CASCADE"), index=True
    )
    actor: Mapped[str] = mapped_column(String(128))
    dispatched_task_id: Mapped[str] = mapped_column(String(64), unique=True)
    status: Mapped[str] = mapped_column(String(24), default="requested")
    error_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    requested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    dispatched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
