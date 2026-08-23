import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func, text

from src.database import Base


class StaticDatasetVersion(Base):
    """Versão de catálogo aplicada com sucesso; linhas antigas preservam a auditoria."""

    __tablename__ = "static_dataset_version"
    __table_args__ = (
        UniqueConstraint("dataset_name", "manifest_sha256", name="uq_static_dataset_manifest"),
        Index(
            "uq_static_dataset_active",
            "dataset_name",
            unique=True,
            postgresql_where=text("active"),
        ),
        CheckConstraint("item_count >= 0", name="ck_static_dataset_item_count"),
        CheckConstraint("recipe_count >= 0", name="ck_static_dataset_recipe_count"),
        CheckConstraint("skipped_recipe_count >= 0", name="ck_static_dataset_skipped_count"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    dataset_name: Mapped[str] = mapped_column(String(64), nullable=False)
    version: Mapped[str] = mapped_column(String(128), nullable=False)
    source_revision: Mapped[str] = mapped_column(String(64), nullable=False)
    manifest_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    items_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    item_dump_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    item_count: Mapped[int] = mapped_column(Integer, nullable=False)
    recipe_count: Mapped[int] = mapped_column(Integer, nullable=False)
    skipped_recipe_count: Mapped[int] = mapped_column(Integer, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    applied_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
