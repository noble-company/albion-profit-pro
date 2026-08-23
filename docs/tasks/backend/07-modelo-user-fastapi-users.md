# 07 — Modelo User + fastapi-users (JWT web)

## Objetivo
Modelo `User` (email/senha) e o backend de autenticação JWT do `fastapi-users`, usado pelo **frontend web** pra registro/login.

## Por que
`fastapi-users` cobre registro, login, hash de senha, JWT, reset de senha e verificação de email prontos e testados em produção por outros projetos — decidido usar em vez de escrever isso à mão. **Atenção**: a biblioteca está em modo manutenção (sem novas features, só patches de segurança) — por isso isolamos toda a integração dentro de `src/auth/`, com uma interface fina, pra facilitar trocar por outra coisa no futuro sem espalhar mudanças pelo resto do código.

## O que implementar
`src/auth/models.py`:
```python
import uuid
from fastapi_users.db import SQLAlchemyBaseUserTableUUID
from sqlalchemy.orm import Mapped, mapped_column

from src.database import Base


class User(SQLAlchemyBaseUserTableUUID, Base):
    """Herda id (UUID), email, hashed_password, is_active, is_superuser, is_verified do fastapi-users."""
    pass
```
(`SQLAlchemyBaseUserTableUUID` já traz todos os campos padrão — não precisamos declarar nada extra nesta task; campos específicos do nosso domínio, se necessários, entram aqui depois.)

`src/auth/manager.py`:
```python
import uuid
from fastapi_users import BaseUserManager, UUIDIDMixin

from src.auth.models import User
from src.config import get_settings

settings = get_settings()


class UserManager(UUIDIDMixin, BaseUserManager[User, uuid.UUID]):
    reset_password_token_secret = settings.jwt_secret
    verification_token_secret = settings.jwt_secret
```

`src/auth/dependencies.py` — wiring do fastapi-users (adapter SQLAlchemy, get_user_manager, backend JWT):
```python
from fastapi_users import FastAPIUsers
from fastapi_users.authentication import AuthenticationBackend, BearerTransport, JWTStrategy
from fastapi_users_db_sqlalchemy import SQLAlchemyUserDatabase

from src.auth.manager import UserManager
from src.auth.models import User
from src.config import get_settings
from src.database import get_session

settings = get_settings()


async def get_user_db(session=Depends(get_session)):
    yield SQLAlchemyUserDatabase(session, User)


async def get_user_manager(user_db=Depends(get_user_db)):
    yield UserManager(user_db)


bearer_transport = BearerTransport(tokenUrl="auth/login")


def get_jwt_strategy() -> JWTStrategy:
    return JWTStrategy(secret=settings.jwt_secret, lifetime_seconds=settings.jwt_lifetime_seconds)


auth_backend = AuthenticationBackend(
    name="jwt",
    transport=bearer_transport,
    get_strategy=get_jwt_strategy,
)

fastapi_users = FastAPIUsers[User, uuid.UUID](get_user_manager, [auth_backend])

current_active_user = fastapi_users.current_user(active=True)
```

`src/auth/schemas.py` — schemas de request/response do fastapi-users:
```python
import uuid
from fastapi_users import schemas


class UserRead(schemas.BaseUser[uuid.UUID]):
    pass


class UserCreate(schemas.BaseUserCreate):
    pass


class UserUpdate(schemas.BaseUserUpdate):
    pass
```

Adicionar migration (task 06 já deixou o harness pronto): `uv run alembic revision --autogenerate -m "add user table"`.

## Bibliotecas/dependências
- `uv add fastapi-users[sqlalchemy]`

## Depende de
Task 05 (banco), Task 06 (Alembic).

## Testes manuais
1. Aplicar a migration: `uv run alembic upgrade head`.
2. `SELECT * FROM "user"` no Postgres local → tabela deve existir com as colunas padrão (`id`, `email`, `hashed_password`, `is_active`, `is_superuser`, `is_verified`).

## Testes automatizados
- `tests/auth/test_user_manager.py`: testa que `UserManager` cria um usuário com senha hasheada corretamente (nunca em texto plano no banco) e rejeita email duplicado.

## Notas de implementação (2026-08-21)
- O snippet de `dependencies.py` acima estava faltando `from fastapi import Depends` — adicionado.
- `models.py`: removi os imports `uuid`/`Mapped`/`mapped_column` do snippet original — não são usados (a classe `User` só tem docstring + herança, sem campos extras declarados ainda), e o `ruff` acusaria `F401`.
- `ruff` acusou `B008` nos dois `Depends(...)` como default de argumento em `dependencies.py` — isso é o jeito **correto** de fazer injeção de dependência no FastAPI, não o problema real que o bugbear normalmente detecta. Adicionei `ignore = ["B008"]` em `[tool.ruff.lint]` no `pyproject.toml` (global, não só pra esse arquivo — esse padrão vai aparecer em praticamente todo router do projeto).
- **Autogenerate do Alembic não importa tipos de terceiros sozinho**: a migration gerada usa `fastapi_users_db_sqlalchemy.generics.GUID()` (tipo customizado de UUID do `fastapi-users`, pra funcionar em qualquer banco) mas não adiciona o `import fastapi_users_db_sqlalchemy` correspondente — precisei adicionar manualmente na migration gerada (`alembic/versions/6354588e51ce_add_user_table.py`). **Correção (2026-08-21, durante a task 08)**: a suposição original de que isso só afetaria a tabela `user` estava **errada** — qualquer coluna com `ForeignKey("user.id")` (mesmo declarada como `Mapped[uuid.UUID]` normal, sem usar `GUID` explicitamente) também renderiza como `fastapi_users_db_sqlalchemy.generics.GUID()` no autogenerate, porque o Alembic herda o tipo da coluna referenciada. Por isso adicionei `import fastapi_users_db_sqlalchemy` **fixo no template** `alembic/script.py.mako` (não só na migration da task 07) — toda migration nova já nasce com esse import, evitando o erro em qualquer tabela que tenha FK pra `user.id` (o que inclui `api_token` da task 08, e provavelmente `market_order`/`market_history` das tasks 10/11 também).
- **Correção retroativa (feita durante a task 08)**: `tests/auth/test_user_manager.py` importava `SQLAlchemyUserDatabase` direto de `fastapi_users_db_sqlalchemy`, o que "envenena" o namespace de `fastapi_users.db` pro resto do processo Python (import circular na própria lib) — quebra qualquer `from fastapi_users.db import ...` posterior no mesmo processo pytest, dependendo da ordem de coleta dos testes. Corrigido pra importar sempre via `fastapi_users.db` (ver nota completa na task 08, seção 5). Também migrado pra usar o helper `tests/utils.py::run_async()` em vez do padrão `asyncio.run()`/`engine.dispose()` manual, que tinha um bug de robustez (não descartava a conexão quando o teste falhava — achado também na task 08).
