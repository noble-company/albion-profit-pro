# 09 — Router de auth

## Objetivo
Expor os endpoints HTTP de autenticação: registro/login/logout (via `fastapi-users`) e geração/listagem/revogação de `ApiToken` (nosso, pro client Go).

## Por que
Junta o que as tasks 07 e 08 já construíram (modelos + lógica) numa API de fato consumível pelo frontend. `fastapi-users` já expõe rotas prontas (`get_register_router`, `get_auth_router`) — só precisamos montá-las, sem reescrever.

## O que implementar
`src/auth/router.py`:
```python
from fastapi import APIRouter

from src.auth.dependencies import auth_backend, fastapi_users
from src.auth.schemas import UserCreate, UserRead, UserUpdate

router = APIRouter(prefix="/auth", tags=["auth"])

router.include_router(fastapi_users.get_auth_router(auth_backend))  # POST /auth/login, /auth/logout
router.include_router(fastapi_users.get_register_router(UserRead, UserCreate))  # POST /auth/register
router.include_router(fastapi_users.get_users_router(UserRead, UserUpdate))  # GET/PATCH /auth/users/me
```

`src/api_tokens/router.py`:
```python
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from src.api_tokens.schemas import ApiTokenCreated, ApiTokenPublic
from src.api_tokens.service import create_token, list_tokens_for_user, revoke_token
from src.auth.dependencies import current_active_user
from src.database import get_session

router = APIRouter(prefix="/auth/tokens", tags=["api-tokens"])


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
    token_id,
    user=Depends(current_active_user),
    session: AsyncSession = Depends(get_session),
):
    await revoke_token(session, token_id, owner_id=user.id)
```
(`list_tokens_for_user` é uma função nova e pequena a adicionar em `src/api_tokens/service.py`, mesma forma de `get_valid_token` — `SELECT ... WHERE user_id = :user_id`; `revoke_token` precisa checar que o token pertence ao `user.id` antes de revogar, senão um usuário poderia revogar token de outro.)

Montar tudo em `src/main.py` (esqueleto mínimo desta task — o resto do `main.py` completo, com todos os routers, fica fechado só depois que os outros domínios existirem, mas o wiring de auth pode ser feito e testado isoladamente agora):
```python
from fastapi import FastAPI
from src.auth.router import router as auth_router
from src.api_tokens.router import router as api_tokens_router

app = FastAPI(title="Albion Profit Pro API")
app.include_router(auth_router)
app.include_router(api_tokens_router)
```

## Bibliotecas/dependências
Nenhuma nova — só monta o que as tasks 07/08 já trouxeram.

## Depende de
Task 07, Task 08.

## Testes manuais
1. `uv run uvicorn src.main:app --reload`
2. `curl -X POST localhost:8000/auth/register -H "Content-Type: application/json" -d '{"email":"a@a.com","password":"senha123"}'` → 201.
3. `curl -X POST localhost:8000/auth/login -d "username=a@a.com&password=senha123"` (form-urlencoded, padrão OAuth2) → retorna `access_token`.
4. `curl -X POST localhost:8000/auth/tokens -H "Authorization: Bearer <access_token>"` → retorna um `ApiTokenCreated` com o token em texto plano.
5. `curl localhost:8000/auth/tokens -H "Authorization: Bearer <access_token>"` → lista tokens (sem reexpor o valor).
6. Acessar `http://localhost:8000/docs` → Swagger UI deve mostrar todos os endpoints acima com os schemas corretos.

## Testes automatizados
- `tests/auth/test_router.py`: fluxo completo via `httpx.AsyncClient` — registrar, logar, criar token, listar, revogar, e confirmar que token revogado não passa mais em `require_api_token` (task 08).

## Notas de implementação (2026-08-21)

1. **`httpx` instalado antecipadamente** (mesma situação das tasks 03/05/07/08 — o teste desta task precisa dele e a task 20 ainda não existe).
2. **Bug real de roteamento, sério**: com `app.include_router(auth_router)` antes de `app.include_router(api_tokens_router)` (como no snippet original), `GET /auth/tokens` era capturado pela rota `GET /auth/{id}` do fastapi-users (users router, dentro de `auth_router`) — o Starlette casa rotas na **ordem de registro**, e `{id}` engolia "tokens" como se fosse o parâmetro. Resultado: 403 Forbidden (essa rota exige superusuário) em vez de cair no nosso router de tokens. **Corrigido invertendo a ordem em `src/main.py`**: `api_tokens_router` é registrado antes de `auth_router`. Isso é frágil por natureza (ordem de registro importa) — se novos routers com paths dinâmicos tipo `/auth/{algumacoisa}` forem adicionados depois, checar esse tipo de colisão de novo.
3. `token_id` no `delete_api_token` estava sem tipo no snippet original (`token_id,`) — adicionado `token_id: uuid.UUID`, necessário pro FastAPI validar/converter o path param.
4. **`delete_api_token` agora levanta 404** quando `revoke_token` retorna `False` (token não existe ou não pertence ao usuário) — não estava no snippet original, mas é o comportamento HTTP correto (sem isso, tentar revogar um token de outro usuário retornaria 204 silenciosamente, escondendo que nada aconteceu).
5. **Decisão de design que valeu a pena documentar**: revogar um token **já revogado** continua retornando 204 (idempotente) — `revoke_token` não distingue "já estava revogado" de "acabei de revogar". 404 fica reservado só pra "esse token não existe/não é seu". Isso é o padrão REST usual pra DELETE (idempotência), decisão consciente, não bug.
6. Rota real do users-router do fastapi-users, conferida via `/openapi.json`: `GET/PATCH /auth/me` (não `/auth/users/me` como o comentário do snippet original sugeria) — comentário corrigido no código.
