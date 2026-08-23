from fastapi import Depends, HTTPException, Request, Security
from fastapi.security import APIKeyHeader
from sqlalchemy.ext.asyncio import AsyncSession

from src.api_tokens.models import ApiToken
from src.api_tokens.service import get_valid_token
from src.database import get_session
from src.rate_limit import enforce_rate_limit, identificar_tentativa_por_token

api_key_header = APIKeyHeader(name="Authorization", auto_error=False)


async def require_api_token(
    authorization: str | None = Security(api_key_header),
    session: AsyncSession = Depends(get_session),
) -> ApiToken:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token ausente")
    raw_token = authorization.removeprefix("Bearer ")
    token = await get_valid_token(session, raw_token)
    if token is None:
        raise HTTPException(status_code=401, detail="Token inválido ou revogado")
    return token


def rate_limited_api_token(bucket_key: str, limit: int, seconds: int):
    """Autentica e limita pelo ID persistido; tentativas invalidas usam somente HMAC.

    A falha do Redis e fail-open nestas rotas: a autenticacao no Postgres continua obrigatoria e
    uma indisponibilidade do cache nao deve interromper a coleta do client.
    """

    async def dependency(
        request: Request,
        authorization: str | None = Security(api_key_header),
        session: AsyncSession = Depends(get_session),
    ) -> ApiToken:
        token: ApiToken | None = None
        detail = "Token ausente"
        if authorization and authorization.startswith("Bearer "):
            raw_token = authorization.removeprefix("Bearer ")
            token = await get_valid_token(session, raw_token)
            detail = "Token invalido ou revogado"

        if token is None:
            await enforce_rate_limit(
                request,
                bucket_key=bucket_key,
                identifier=identificar_tentativa_por_token(authorization),
                limit=limit,
                seconds=seconds,
                redis_failure="open",
            )
            raise HTTPException(status_code=401, detail=detail)

        await enforce_rate_limit(
            request,
            bucket_key=bucket_key,
            identifier=f"api-token:{token.id}",
            limit=limit,
            seconds=seconds,
            redis_failure="open",
        )
        return token

    return dependency
