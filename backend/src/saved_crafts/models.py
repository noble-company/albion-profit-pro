import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from src.database import Base


class SavedCraft(Base):
    """Uma receita que o jogador escolheu acompanhar num realm."""

    __tablename__ = "saved_craft"
    __table_args__ = (
        CheckConstraint("server IN ('west', 'east', 'europe')", name="ck_saved_craft_server"),
        CheckConstraint("quantity >= 1 AND quantity <= 1000000", name="ck_saved_craft_quantity"),
        CheckConstraint(
            "output_quality >= 1 AND output_quality <= 5",
            name="ck_saved_craft_output_quality",
        ),
        Index("ix_saved_craft_user_server_updated", "user_id", "server", "updated_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True
    )
    server: Mapped[str] = mapped_column(String(8), nullable=False)
    # Chave de negócio estável. Sem FK: a semeadura do catálogo recria Recipe com UUID novo.
    output_item: Mapped[str] = mapped_column(String(64), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    output_quality: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
