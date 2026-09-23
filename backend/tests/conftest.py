"""
Setup de testes (task 20): sobe Postgres/Redis/RabbitMQ efêmeros via
testcontainers, aponta as env vars da app pra eles, aplica as migrations
Alembic, e expõe fixtures `client`/`db_session` pros testes usarem.

Desvio deliberado da spec original: a spec descrevia esse setup como uma
fixture `session`-scoped `autouse=True`. Isso NÃO funciona neste projeto:
`src/database.py`/`src/celery_app.py` chamam `get_settings()` (que é
`@lru_cache`) e criam engine/app **no import do módulo**, não sob demanda. O
pytest importa todos os arquivos de teste (coleta) ANTES de rodar qualquer
fixture — então, no momento em que uma fixture normal (mesmo autouse) rodaria,
qualquer teste com `from src.database import ...`/`from src.main import app`
no topo do arquivo já teria disparado esse import (e travado a settings
errada no cache do processo inteiro, sem jeito de desfazer depois).

A correção é usar o hook `pytest_configure` (roda ANTES da fase de coleta) pra
subir os containers e setar as env vars — garante que a primeira chamada de
`get_settings()` em todo o processo já vê as URLs certas, não importa qual
arquivo de teste for importado primeiro.
"""

import ipaddress
import json
import os
import uuid
from pathlib import Path

import pytest
import pytest_asyncio
from fastapi_users.db import SQLAlchemyUserDatabase
from httpx import ASGITransport, AsyncClient
from testcontainers.community.postgres import PostgresContainer
from testcontainers.community.rabbitmq import RabbitMqContainer
from testcontainers.community.redis import RedisContainer

_containers: dict[str, object] = {}

FIXTURES_WIRE = Path(__file__).resolve().parent / "fixtures" / "wire"


def _rabbitmq_url(container: RabbitMqContainer) -> str:
    host = container.get_container_host_ip()
    port = container.get_exposed_port(container.port)
    # vhost "/" vira "//" na URL (mesma convenção usada no .env.example) — o
    # pika não expõe um helper de URL pronto (só get_connection_params()).
    vhost = "" if container.vhost == "/" else container.vhost
    return f"amqp://{container.username}:{container.password}@{host}:{port}/{vhost}"


def pytest_configure(config: pytest.Config) -> None:
    postgres = PostgresContainer("postgres:16").start()
    redis = RedisContainer("redis:7").start()
    rabbitmq = RabbitMqContainer("rabbitmq:3-management").start()
    _containers["postgres"] = postgres
    _containers["redis"] = redis
    _containers["rabbitmq"] = rabbitmq

    os.environ["DATABASE_URL"] = postgres.get_connection_url().replace(
        "postgresql+psycopg2", "postgresql+asyncpg"
    )
    os.environ["REDIS_URL"] = (
        f"redis://{redis.get_container_host_ip()}:{redis.get_exposed_port(6379)}/0"
    )
    os.environ["RABBITMQ_URL"] = _rabbitmq_url(rabbitmq)
    os.environ["JWT_SECRET"] = (
        "test-secret-not-for-production-32ch"  # >=32 chars evita InsecureKeyLengthWarning do PyJWT
    )
    os.environ.setdefault("JWT_LIFETIME_SECONDS", "3600")
    os.environ.setdefault("CORS_ORIGINS", '["http://localhost:5173"]')
    # ENVIRONMENT não é setado aqui de propósito — Settings.environment já tem
    # default "development" no lado do Python; test_config.py depende desse
    # default quando a env var não é explicitamente sobrescrita pelo teste.

    from alembic.config import Config

    from alembic import command

    alembic_cfg = Config(str(Path(__file__).resolve().parent.parent / "alembic.ini"))
    command.upgrade(alembic_cfg, "head")


def pytest_unconfigure(config: pytest.Config) -> None:
    for container in _containers.values():
        container.stop()
    _containers.clear()


@pytest_asyncio.fixture
async def client():
    """Peer IPv6 sintético e único por teste, sem confiar em header encaminhado arbitrário."""
    from src.main import app

    documentation_prefix = int(ipaddress.IPv6Address("2001:db8::"))
    peer = str(ipaddress.IPv6Address(documentation_prefix | (uuid.uuid4().int & ((1 << 96) - 1))))
    transport = ASGITransport(app=app, client=(peer, 12345))
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def db_session():
    from src.database import async_session_maker

    async with async_session_maker() as session:
        yield session


def unique_email(prefix: str = "test") -> str:
    return f"{prefix}-{uuid.uuid4().hex[:12]}@example.com"


async def criar_usuario(session, email: str | None = None, password: str = "senha-super-secreta"):
    """Cria um `User` de verdade (via `UserManager`, senha hasheada) sem passar pelo HTTP —
    pra testes que só precisam de uma linha válida pra satisfazer FK (ex: `market_scan`) ou
    exercitar lógica de domínio direto."""
    from src.auth.manager import UserManager
    from src.auth.models import User
    from src.auth.schemas import UserCreate

    user_db = SQLAlchemyUserDatabase(session, User)
    manager = UserManager(user_db)
    return await manager.create(UserCreate(email=email or unique_email(), password=password))


async def registrar_e_logar(
    client: AsyncClient, email: str | None = None, password: str = "senha123456"
) -> tuple[uuid.UUID, str]:
    """Registro + login via HTTP no `client` de teste. Pra testes que precisam de mais de um
    usuário distinto na mesma execução — quem só precisa de um usuário autenticado usa a
    fixture `cliente_autenticado`."""
    email = email or unique_email()
    resp = await client.post("/auth/register", json={"email": email, "password": password})
    assert resp.status_code == 201, resp.text
    user_id = uuid.UUID(resp.json()["id"])
    resp = await client.post("/auth/login", data={"username": email, "password": password})
    assert resp.status_code == 200, resp.text
    return user_id, resp.json()["access_token"]


@pytest_asyncio.fixture
async def usuario(db_session):
    return await criar_usuario(db_session)


@pytest_asyncio.fixture
async def cliente_autenticado(client: AsyncClient, usuario):
    """`client` autenticado como `usuario` (senha fixa da fixture) — devolve o mesmo
    AsyncClient com o header `Authorization` já setado."""
    resp = await client.post(
        "/auth/login", data={"username": usuario.email, "password": "senha-super-secreta"}
    )
    assert resp.status_code == 200, resp.text
    client.headers["Authorization"] = f"Bearer {resp.json()['access_token']}"
    return client


@pytest_asyncio.fixture
async def token_api(db_session, usuario) -> str:
    """Token de API cru (não hasheado) pro ingest, já associado a `usuario`."""
    from src.api_tokens.service import create_token

    token = await create_token(db_session, usuario.id)
    return token.token


@pytest.fixture
def payload_ordens_real() -> dict:
    """Payload real de `marketorders.ingest` (capturado do jogo, task 25/36) no formato de
    fio (PascalCase) — ver docs/03-contrato-ingest-real.md."""
    return json.loads((FIXTURES_WIRE / "marketorders-real-t2fiber.json").read_text())


@pytest.fixture
def payload_historico_real() -> dict:
    """Payload real de `markethistories.ingest` (Timescale=2, capturado do jogo)."""
    return json.loads((FIXTURES_WIRE / "markethistories-real-t2fiber-ts2.json").read_text())


@pytest_asyncio.fixture(autouse=True)
async def _limpa_tabelas_apos_teste():
    """Isolamento por limpeza, não por transação com rollback (task 36, item 3): as tasks
    Celery de ingest abrem seu próprio engine `NullPool` dentro de `_run_async` (task 23),
    fora de qualquer savepoint que esta fixture poderia abrir na sessão de teste — nested
    transaction não isolaria essa fatia da suíte, então a limpeza por tabela é o caminho que
    funciona pros dois casos (chamada direta de service e wrapper Celery de verdade)."""
    yield

    import src.api_tokens.models  # noqa: F401
    import src.auth.models  # noqa: F401
    import src.items.models  # noqa: F401
    import src.prices.models  # noqa: F401
    import src.quarantine.models  # noqa: F401
    import src.recipes.models  # noqa: F401
    import src.saved_crafts.models  # noqa: F401
    import src.static_data.models  # noqa: F401
    from src.database import Base, async_session_maker

    async with async_session_maker() as session:
        for table in reversed(Base.metadata.sorted_tables):
            await session.execute(table.delete())
        await session.commit()

    from src.cache.redis_client import get_redis

    redis = get_redis()
    for pattern in ("rl:*", "opportunities:v2:*", "livro:*"):
        keys = [key async for key in redis.scan_iter(match=pattern)]
        if keys:
            await redis.delete(*keys)
