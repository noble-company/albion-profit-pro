# 08 — ApiToken + auth do client Go

## Objetivo
Modelo `ApiToken` (token pessoal, opaco, de longa duração) e um segundo backend de autenticação do `fastapi-users` — usado pelo **client Go**, não pelo frontend — pra autenticar os POSTs de ingest sem precisar de login JWT (o client roda sem interação do usuário depois de configurado uma vez).

## Por que
O `fastapi-users` foi desenhado justamente para múltiplos backends de autenticação simultâneos (ex: JWT pra web + outro método pra API/serviço) — documentado como caso de uso de primeira classe, não gambiarra. Em vez de JWT (que expira e exigiria o client renovar sozinho, complexidade desnecessária pra um desktop app), usamos uma estratégia de **Database** (token opaco armazenado no banco, comparado a cada requisição) — não expira a menos que o usuário revogue manualmente na tela de configurações.

## O que implementar
`src/api_tokens/models.py`:
```python
import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from src.database import Base


class ApiToken(Base):
    __tablename__ = "api_token"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id"), nullable=False, index=True)
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    revoked_at: Mapped[datetime | None] = mapped_column(nullable=True)
```

`src/api_tokens/service.py` — geração e validação:
```python
import secrets

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api_tokens.models import ApiToken


def generate_token() -> str:
    return f"apk_{secrets.token_hex(24)}"  # ~48 chars, prefixo identifica o tipo (facilita busca/regex em logs)


async def create_token(session: AsyncSession, user_id) -> ApiToken:
    token = ApiToken(user_id=user_id, token=generate_token())
    session.add(token)
    await session.commit()
    await session.refresh(token)
    return token


async def get_valid_token(session: AsyncSession, raw_token: str) -> ApiToken | None:
    result = await session.execute(
        select(ApiToken).where(ApiToken.token == raw_token, ApiToken.revoked_at.is_(None))
    )
    return result.scalar_one_or_none()


async def revoke_token(session: AsyncSession, token_id) -> None:
    ...  # seta revoked_at = now()
```

`src/api_tokens/schemas.py`:
```python
import uuid
from datetime import datetime
from pydantic import BaseModel


class ApiTokenCreated(BaseModel):
    """Retornado só na criação — é a única vez que o token em texto plano é exposto."""
    id: uuid.UUID
    token: str
    created_at: datetime


class ApiTokenPublic(BaseModel):
    """Usado ao listar tokens existentes — nunca reexpõe o valor do token."""
    id: uuid.UUID
    created_at: datetime
    revoked_at: datetime | None
```

Dependency de autenticação pro client Go (`src/api_tokens/service.py` ou `dependencies.py` próprio):
```python
from fastapi import Depends, HTTPException, Security
from fastapi.security import APIKeyHeader

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
```
Esse `require_api_token` é o que o router de ingest (task 16) vai usar via `Depends(require_api_token)`.

Migration: `uv run alembic revision --autogenerate -m "add api_token table"`.

## Bibliotecas/dependências
Nenhuma nova além do que a task 07 já trouxe (usa `fastapi.security.APIKeyHeader`, já parte do FastAPI).

## Depende de
Task 07 (precisa da tabela `user` existir pra `ForeignKey`).

## Testes manuais
1. Aplicar migration, confirmar tabela `api_token` criada.
2. Via um script Python ou endpoint temporário, gerar um token pra um usuário de teste, copiar o valor.
3. `curl -H "Authorization: Bearer <token>" http://localhost:8000/qualquer-endpoint-protegido` → deve passar na dependency sem erro 401.
4. Testar com token inválido/inexistente → deve retornar 401.

## Testes automatizados
- `tests/auth/test_api_token.py`: testa geração de token (formato `apk_...`, único no banco), validação de token válido/inválido/revogado, e que `require_api_token` levanta 401 nos casos certos.

## Notas de implementação (2026-08-21)

1. **`require_api_token` foi pra `src/api_tokens/dependencies.py`** (arquivo novo, não estava no esqueleto da task 02) em vez de ficar em `service.py` — mantém a mesma separação de responsabilidade que `src/auth/` já usa (service = CRUD puro, dependencies = wiring de FastAPI).
2. **`revoke_token` implementado com verificação de dono** (`owner_id`), não só o `...` placeholder do spec original — necessário pro router da task 09 (`revoke_token(session, token_id, owner_id=user.id)`) e é o comportamento de segurança correto (um usuário não pode revogar token de outro). Retorna `bool` em vez de `None`.
3. **`list_tokens_for_user` adicionada** em `service.py` — não estava nesta task originalmente, mas a task 09 já a referenciava; implementada aqui pra manter o módulo de serviço completo de uma vez.
4. **Bug real de tipo de dado**: `revoked_at` é `TIMESTAMP WITHOUT TIME ZONE` no Postgres, mas o código gravava `datetime.now(UTC)` (timezone-aware) — asyncpg rejeita com `TypeError: can't subtract offset-naive and offset-aware datetimes`. Corrigido pra `datetime.now(timezone.utc).replace(tzinfo=None)`.
5. **Bug real de import circular no `fastapi-users`**: importar `SQLAlchemyUserDatabase` direto de `fastapi_users_db_sqlalchemy` (em vez de via `fastapi_users.db`) "envenena" o namespace de `fastapi_users.db` pro resto do processo Python — qualquer `from fastapi_users.db import SQLAlchemyBaseUserTableUUID` posterior falha com `ImportError`, mesmo em arquivos completamente diferentes, dependendo só da ordem de coleta dos testes pelo pytest. **Convenção adotada em todo o projeto: sempre importar essas classes via `fastapi_users.db`, nunca direto de `fastapi_users_db_sqlalchemy`.** Corrigido também retroativamente em `tests/auth/test_user_manager.py` (task 07).
6. **Bug real de robustez nos testes**: o padrão `asyncio.run(_run()); asyncio.run(engine.dispose())` (introduzido na task 05) pulava o `dispose()` sempre que `_run()` levantava exceção, deixando conexão pendurada e quebrando o teste seguinte em cascata. Extraído um helper `tests/utils.py::run_async()` com `try/finally` de verdade, e todos os arquivos de teste existentes (`test_database.py`, `test_user_manager.py`, `test_api_token.py`) foram migrados pra usá-lo.
7. Testes manuais 3-4 da spec original (curl num endpoint HTTP protegido) não são executáveis ainda — não existe nenhum servidor rodando com routers registrados (isso é a task 09). Validei a mesma lógica via script manual chamando `require_api_token()` diretamente (token válido aceito, inválido rejeitado com 401) — resultado OK, script descartado depois.
