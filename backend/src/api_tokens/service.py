import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api_tokens.models import ApiToken

# Granularidade do update de `ultimo_uso_em` — token de API é usado a cada request de
# ingest; escrever a cada uma dessas tornaria isso o gargalo do caminho quente (task 32).
ULTIMO_USO_GRANULARIDADE = timedelta(hours=1)


def generate_token() -> str:
    return f"apk_{secrets.token_hex(24)}"  # ~48 chars, prefixo identifica o tipo (facilita busca/regex em logs)


def hash_token(cru: str) -> str:
    return hashlib.sha256(cru.encode()).hexdigest()


async def create_token(session: AsyncSession, user_id: uuid.UUID) -> ApiToken:
    """Devolve a instância com o valor cru acessível via `.token` — atributo Python comum,
    não uma coluna mapeada, então nunca é persistido. É a única vez que esse valor existe
    fora da memória do processo que gerou (task 32, achado A1)."""
    raw = generate_token()
    token = ApiToken(user_id=user_id, token_hash=hash_token(raw), token_sufixo=raw[-4:])
    session.add(token)
    await session.commit()
    await session.refresh(token)
    token.token = raw
    return token


async def get_valid_token(session: AsyncSession, raw_token: str) -> ApiToken | None:
    result = await session.execute(
        select(ApiToken).where(
            ApiToken.token_hash == hash_token(raw_token), ApiToken.revoked_at.is_(None)
        )
    )
    token = result.scalar_one_or_none()
    if token is None:
        return None
    now = datetime.now(timezone.utc)
    if token.ultimo_uso_em is None or (now - token.ultimo_uso_em) > ULTIMO_USO_GRANULARIDADE:
        token.ultimo_uso_em = now
        await session.commit()
    return token


async def list_tokens_for_user(session: AsyncSession, user_id: uuid.UUID) -> list[ApiToken]:
    result = await session.execute(
        select(ApiToken).where(ApiToken.user_id == user_id).order_by(ApiToken.created_at.desc())
    )
    return list(result.scalars().all())


async def revoke_token(session: AsyncSession, token_id: uuid.UUID, owner_id: uuid.UUID) -> bool:
    """Revoga um token, mas só se pertencer a `owner_id` — evita um usuário revogar token de outro.

    Retorna True se revogou, False se o token não existe ou não pertence ao owner_id
    (o router decide se isso vira um 404).
    """
    result = await session.execute(
        select(ApiToken).where(ApiToken.id == token_id, ApiToken.user_id == owner_id)
    )
    token = result.scalar_one_or_none()
    if token is None:
        return False
    token.revoked_at = datetime.now(timezone.utc)
    await session.commit()
    return True
