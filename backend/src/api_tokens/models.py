import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from src.database import Base


class ApiToken(Base):
    """Guarda só o hash do token; o valor cru nunca fica persistido e
    existe só na resposta HTTP da criação. `create_token` devolve o valor cru como atributo
    Python transiente (não mapeado) na própria instância, não como coluna."""

    __tablename__ = "api_token"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id"), nullable=False, index=True)

    # sha256 hex do token cru — o valor em texto só existe na resposta da criação.
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    # últimos 4 caracteres do token, só pra UI ("apk_...a3f9") — não é segredo.
    token_sufixo: Mapped[str] = mapped_column(String(8), nullable=False)

    nome: Mapped[str | None] = mapped_column(String(64), nullable=True)  # "PC de casa"
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # barato e resolve "esse token ainda é usado?" na hora de revogar — atualizado com
    # granularidade grossa (só se fez mais de 1h desde o último uso), não a cada request.
    ultimo_uso_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
