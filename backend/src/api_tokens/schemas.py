import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr


class ApiTokenCreated(BaseModel):
    """Retornado só na criação — é a única vez que o token em texto plano é exposto."""

    id: uuid.UUID
    token: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ApiTokenPublic(BaseModel):
    """Usado ao listar tokens existentes — nunca reexpõe o valor do token, só o suficiente
    pra identificar qual token é qual na UI (task 32)."""

    id: uuid.UUID
    token_sufixo: str
    nome: str | None
    created_at: datetime
    revoked_at: datetime | None
    ultimo_uso_em: datetime | None

    model_config = {"from_attributes": True}


class ClientIdentity(BaseModel):
    """Resposta de `GET /client/me` — o que o client Go usa pra confirmar, no boot, que o
    token dele é válido (ver docs/tasks/client/04). Só identifica; nunca reexpõe o valor do
    token. `email` é o do próprio dono do token, então não vaza dado de terceiro, e
    `token_sufixo` diz *qual* token está em uso sem revelar o segredo."""

    user_id: uuid.UUID
    email: EmailStr
    token_sufixo: str
