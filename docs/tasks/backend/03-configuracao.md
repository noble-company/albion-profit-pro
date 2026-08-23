# 03 — Configuração (Settings)

## Objetivo
Um único ponto de verdade para toda configuração via variáveis de ambiente, usando `pydantic-settings`, com validação de tipos e um `.env.example` documentando cada variável.

## Por que
`pydantic-settings` é a extensão oficial do Pydantic v2 pra esse propósito exato (substituiu o `BaseSettings` que antes vivia no Pydantic core) — validação automática, suporte nativo a `.env`, e já é dependência transitiva do FastAPI/Pydantic que já estamos usando. Confirmado compatível com Python 3.13/3.14 na pesquisa. Evita gambiarra de `os.environ.get(...)` espalhado pelo código.

## O que implementar
`src/config.py`:
```python
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    environment: str = "development"

    # Postgres
    database_url: str  # postgresql+asyncpg://user:pass@host:5432/dbname

    # Redis
    redis_url: str  # redis://host:6379/0

    # RabbitMQ (broker do Celery)
    rabbitmq_url: str  # amqp://user:pass@host:5672//

    # Auth (fastapi-users)
    jwt_secret: str
    jwt_lifetime_seconds: int = 3600

    # CORS (frontend)
    cors_origins: list[str] = ["http://localhost:5173"]

@lru_cache
def get_settings() -> Settings:
    return Settings()
```

`.env.example` (raiz de `backend/`):
```
ENVIRONMENT=development
DATABASE_URL=postgresql+asyncpg://profitpro:profitpro@localhost:5432/profitpro
REDIS_URL=redis://localhost:6379/0
RABBITMQ_URL=amqp://guest:guest@localhost:5672//
JWT_SECRET=troque-por-um-segredo-forte-gerado-com-openssl-rand-hex-32
JWT_LIFETIME_SECONDS=3600
CORS_ORIGINS=["http://localhost:5173"]
```
Copiar pra `.env` local (gitignored) antes de rodar qualquer coisa.

## Bibliotecas/dependências
- `uv add pydantic-settings` (versão ≥2.12, confirmada compatível com 3.13/3.14 na pesquisa)
- `uv add --dev pytest` — **nota (implementado em 2026-08-21)**: adiantado da task 20, porque esta é a primeira task com teste automatizado de verdade e `pytest` ainda não estava instalado (a task 20 originalmente ia trazer isso). O teste desta task não depende de containers/serviços externos, só de `pytest` puro — `pytest-asyncio`/`httpx`/`testcontainers` continuam sendo responsabilidade da task 20, quando os testes de integração de verdade começarem.

## Depende de
Task 02 (estrutura de pastas).

## Testes manuais
1. Criar `.env` a partir do `.env.example` com valores locais.
2. `uv run python -c "from src.config import get_settings; print(get_settings())"` → deve imprimir o objeto `Settings` com os valores lidos do `.env`, sem erro de validação.
3. Remover uma variável obrigatória do `.env` (ex: `DATABASE_URL`) e rodar de novo → deve dar erro claro do Pydantic dizendo qual campo falta (confirma que a validação está ativa).

## Testes automatizados
- `tests/test_config.py`: testa que `Settings` carrega corretamente com env vars de teste (via `monkeypatch.setenv` do pytest), e que falha (`ValidationError`) quando uma variável obrigatória está ausente.
