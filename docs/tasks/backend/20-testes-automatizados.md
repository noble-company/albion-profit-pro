# 20 — Testes automatizados (setup)

## Objetivo
`tests/conftest.py` com fixtures de Postgres/Redis/RabbitMQ via `testcontainers`, mais `httpx.AsyncClient` pra testar os endpoints FastAPI diretamente (sem precisar de servidor real rodando). Esta task formaliza o setup que todas as outras tasks já referenciam nos seus próprios "Testes automatizados".

## Por que
Testar contra containers reais e efêmeros (não mocks) evita o clássico problema de "passou no teste, quebrou em produção" por causa de comportamento específico do Postgres/Redis/RabbitMQ que um mock não reproduz. É o padrão recomendado atualmente pra esse tipo de stack (pesquisa confirmou `testcontainers-python` como abordagem corrente).

## O que implementar
`tests/conftest.py`:
```python
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from testcontainers.postgres import PostgresContainer
from testcontainers.rabbitmq import RabbitMqContainer
from testcontainers.redis import RedisContainer

from alembic import command
from alembic.config import Config


@pytest.fixture(scope="session")
def postgres_container():
    with PostgresContainer("postgres:16") as postgres:
        yield postgres


@pytest.fixture(scope="session")
def redis_container():
    with RedisContainer("redis:7") as redis:
        yield redis


@pytest.fixture(scope="session")
def rabbitmq_container():
    with RabbitMqContainer("rabbitmq:3-management") as rabbitmq:
        yield rabbitmq


@pytest.fixture(scope="session", autouse=True)
def _configure_test_env(postgres_container, redis_container, rabbitmq_container, monkeypatch_session):
    """Aponta as env vars da aplicação pros containers de teste ANTES de qualquer import de src.config."""
    monkeypatch_session.setenv("DATABASE_URL", postgres_container.get_connection_url().replace("psycopg2", "asyncpg"))
    monkeypatch_session.setenv("REDIS_URL", f"redis://{redis_container.get_container_host_ip()}:{redis_container.get_exposed_port(6379)}/0")
    monkeypatch_session.setenv("RABBITMQ_URL", rabbitmq_container.get_connection_url())
    monkeypatch_session.setenv("JWT_SECRET", "test-secret-not-for-production")


@pytest.fixture(scope="session", autouse=True)
def _run_migrations(_configure_test_env):
    """Aplica todas as migrations Alembic contra o Postgres de teste antes da suíte rodar."""
    alembic_cfg = Config("alembic.ini")
    command.upgrade(alembic_cfg, "head")


@pytest_asyncio.fixture
async def client(_run_migrations):
    from src.main import app  # import tardio, depois das env vars de teste já estarem setadas

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def db_session(_run_migrations):
    from src.database import async_session_maker

    async with async_session_maker() as session:
        yield session
```
(nota: `monkeypatch_session` não existe nativamente no pytest — implementar como um fixture-wrapper de sessão em cima do `monkeypatch` padrão, que é function-scoped por padrão; é um padrão conhecido, várias libs de exemplo mostram como adaptar. Detalhe de implementação a resolver na hora, não muda a estrutura geral acima.)

`pyproject.toml` (adicionar, complementando a task 01):
```toml
[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
```

## Bibliotecas/dependências
- `uv add --dev pytest pytest-asyncio httpx "testcontainers[postgres,redis,rabbitmq]"`

## Depende de
Task 01 (tooling), Task 06 (Alembic — usado pra aplicar migrations no container de teste), Task 09 (precisa de `src.main:app` existir, mesmo que parcial).

## Testes manuais
1. `docker ps` → confirmar Docker Desktop rodando (testcontainers precisa dele).
2. `uv run pytest tests/ -v` → deve subir os 3 containers (demora alguns segundos na primeira vez), aplicar migrations, e rodar (mesmo que ainda não haja testes de domínio — confirma que a infra de teste funciona).

## Testes automatizados
Esta é a própria task de setup de testes — o "teste automatizado" dela é: rodar `pytest` do zero num ambiente limpo (ex: CI) e confirmar que a suíte sobe os containers, aplica migrations e conclui sem erro de infraestrutura (mesmo com 0 testes de domínio ainda escritos). Cada task anterior (07 a 19) referencia os testes de domínio específicos que dependem deste setup.

## Notas de implementação (2026-08-22)

Implementada depois de já existirem ~49 testes de domínio (tasks 07-19), todos escritos contra o Postgres/Redis/RabbitMQ **locais do docker-compose** (não testcontainers) via um helper provisório `tests/utils.run_async`, porque cada task anterior adiava esse setup pra esta. Pedido explícito do usuário: implementar a task **e migrar** os testes já existentes pra usar a infra nova, não deixar dois padrões coexistindo.

### Desvio 1 — `pytest_configure`, não fixture `session`-scoped `autouse=True`

A spec original usava uma fixture `session`-scoped `autouse=True` pra apontar as env vars pros containers. **Isso não funciona neste projeto**: `src/database.py`/`src/celery_app.py` chamam `get_settings()` (que é `@lru_cache`) e criam engine/app **no import do módulo**, não sob demanda. O pytest importa **todos** os arquivos de teste (fase de coleta) **antes** de rodar qualquer fixture — então qualquer teste com `from src.database import ...` no topo do arquivo (praticamente todos) já dispara esse import antes de qualquer fixture rodar, travando a settings errada no cache do processo inteiro, sem jeito de desfazer depois.

Correção: usar o hook `pytest_configure(config)` (roda antes da fase de coleta) pra subir os containers, setar as env vars, e já aplicar as migrations Alembic. Ver `tests/conftest.py`.

### Desvio 2 — imports `testcontainers.community.*`, não `testcontainers.postgres`/`.redis`/`.rabbitmq`

A versão instalada (`testcontainers==4.15.0`) deprecou os módulos top-level em favor de `testcontainers.community.*` (mesma API, só o caminho de import muda). Usados os novos caminhos direto, evitando o `DeprecationWarning`.

### Desvio 3 — `RabbitMqContainer` não tem `get_connection_url()`

A spec assumia um método pronto (como o `PostgresContainer` tem). A API real só expõe `get_connection_params()` (retorna um `pika.ConnectionParameters`, não uma URL) — a URL AMQP é montada manualmente em `tests/conftest.py::_rabbitmq_url()` a partir de `username`/`password`/`get_container_host_ip()`/`get_exposed_port()`/`vhost`.

### Desvio 4 — event loop `session`-scoped, não uma por teste

`pytest-asyncio` (1.4.0) cria uma loop nova por teste por padrão. Isso quebraria os singletons de módulo do projeto (`engine`, `celery_app`, o client Redis lazy em `src/cache/redis_client.py`) no 2º teste em diante — cada um fica amarrado à primeira loop que o usou, e reusar numa loop nova (já fechada) é exatamente o erro "Event loop is closed" que apareceu repetidamente nas tasks 14/17/18/19 antes desta task existir. `pyproject.toml` seta `asyncio_default_fixture_loop_scope = "session"` e `asyncio_default_test_loop_scope = "session"` — uma loop só pra sessão inteira de testes.

### Migração dos testes existentes (pedido do usuário, além do escopo original da spec)

Todos os arquivos em `tests/` (exceto `test_schemas.py`, que não toca infraestrutura) foram convertidos de `def test_x(): run_async(_run())` pra `async def test_x():` nativo, aproveitando o `asyncio_mode = "auto"` (já estava no `pyproject.toml` desde a task 01, mas o pacote `pytest-asyncio` nunca tinha sido instalado — por isso o warning "Unknown config option: asyncio_mode" aparecia em todo `pytest` até agora). `tests/utils.py` foi deletado (sem mais nenhuma referência). `tests/auth/test_router.py`, `tests/ingest/test_router.py` e `tests/prices/test_router.py` passaram a usar a fixture `client` em vez de criar o próprio `ASGITransport`/`AsyncClient`.

**Achado real durante a migração**: `tests/ingest/test_tasks.py` chamava `.delay()` em modo eager (`task_always_eager=True`) de dentro do teste — isso funcionava quando o teste era uma função `def` comum (sem loop rodando), mas quebra com `async def` nativo (o teste já roda dentro de uma loop via pytest-asyncio, e o `asyncio.run()` interno da task não pode rodar dentro de uma loop já em execução). Corrigido chamando as coroutines internas da task (`_process_market_orders`/`_process_market_history`, já existiam em `src/ingest/tasks.py`) diretamente, sem passar pelo `.delay()`/Celery — testa a mesma lógica de gravação, sem a reentrância de loop. A cobertura de ".delay() realmente publica no broker" ficou com `tests/ingest/test_router.py`, que agora publica de verdade no RabbitMQ efêmero (sem consumidor rodando durante os testes, então a mensagem fica na fila — não é executada ali).
