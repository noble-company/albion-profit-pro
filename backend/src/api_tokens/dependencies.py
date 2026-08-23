from fastapi import Depends, HTTPException, Security
from fastapi.security import APIKeyHeader
from sqlalchemy.ext.asyncio import AsyncSession

from src.api_tokens.models import ApiToken
from src.api_tokens.service import get_valid_token
from src.database import get_session

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
