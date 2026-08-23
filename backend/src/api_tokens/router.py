import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from src.api_tokens.dependencies import require_api_token
from src.api_tokens.models import ApiToken
from src.api_tokens.schemas import ApiTokenCreated, ApiTokenPublic, ClientIdentity
from src.api_tokens.service import create_token, list_tokens_for_user, revoke_token
from src.auth.dependencies import current_active_user
from src.auth.models import User
from src.database import get_session
from src.rate_limit import identificar_por_token, rate_limit

router = APIRouter(prefix="/auth/tokens", tags=["api-tokens"])

# Router separado porque `/client/me` não pertence ao prefixo `/auth/tokens` — e, diferente
# das rotas acima, é autenticado pelo token opaco do client Go, não pelo JWT da web.
client_router = APIRouter(
    prefix="/client",
    tags=["client"],
    # Por token, igual ao ingest. Limite baixo: o client chama isso uma vez por boot, então
    # 30/min já cobre reinício e retry, e ainda fecha a porta pra varredura de tokens.
    dependencies=[
        Depends(rate_limit("rl:client", limit=30, seconds=60, identifier=identificar_por_token))
    ],
)


@client_router.get("/me", response_model=ClientIdentity)
async def client_me(
    token: ApiToken = Depends(require_api_token),
    session: AsyncSession = Depends(get_session),
):
    """Ping autenticado pro client Go conferir, no boot, que o token dele é válido — sem
    precisar ter dado pra mandar.

    Sem isso o único sinal de token errado é um 401 perdido no `albiondata-client.log`, e o
    usuário não consegue distinguir "token errado" de "client não está coletando" (achado
    `N6`) — dois modos de falha silenciosa com o mesmo sintoma: "não aparece nada no site".
    """
    user = await session.get(User, token.user_id)
    if user is None:
        # FK garante que não acontece; se acontecer, é dado corrompido e não um 500 opaco.
        raise HTTPException(status_code=404, detail="Usuário do token não encontrado")

    return ClientIdentity(user_id=user.id, email=user.email, token_sufixo=token.token_sufixo)


@router.post("", response_model=ApiTokenCreated, status_code=201)
async def create_api_token(
    user=Depends(current_active_user),
    session: AsyncSession = Depends(get_session),
):
    """Gera um novo token pro usuário logado colar no config.yaml do client Go."""
    return await create_token(session, user.id)


@router.get("", response_model=list[ApiTokenPublic])
async def list_api_tokens(
    user=Depends(current_active_user),
    session: AsyncSession = Depends(get_session),
):
    return await list_tokens_for_user(session, user.id)


@router.delete("/{token_id}", status_code=204)
async def delete_api_token(
    token_id: uuid.UUID,
    user=Depends(current_active_user),
    session: AsyncSession = Depends(get_session),
):
    revoked = await revoke_token(session, token_id, owner_id=user.id)
    if not revoked:
        raise HTTPException(status_code=404, detail="Token não encontrado")
