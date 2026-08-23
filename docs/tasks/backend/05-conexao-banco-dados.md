# 05 — Conexão com banco de dados

## Objetivo
Engine e sessão assíncrona do SQLAlchemy 2.0 conectando no Postgres, uma `Base` declarativa compartilhada por todos os modelos, e uma dependency `get_session` pro FastAPI injetar em qualquer router.

## Por que
SQLAlchemy 2.0 (estilo assíncrono, com `asyncpg` como driver) é o ORM padrão de fato pra FastAPI em produção — confirmado compatível com Python 3.13/3.14 na pesquisa. **Importante**: `asyncpg` precisa ser `>=0.31.0` — versões anteriores não têm wheel pra Python 3.13/3.14 e vão falhar silenciosamente ou não instalar.

## O que implementar
`src/database.py`:
```python
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from src.config import get_settings

settings = get_settings()

engine = create_async_engine(settings.database_url, pool_pre_ping=True)
async_session_maker = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_maker() as session:
        yield session
```

Notas:
- `pool_pre_ping=True` evita erros de conexão "morta" depois de idle longo (comum com Postgres atrás de proxy/firewall).
- `expire_on_commit=False` evita que objetos ORM fiquem inválidos depois de um `commit()` dentro da mesma requisição — comportamento mais previsível em contexto async.
- Todos os modelos das próximas tasks (`User`, `ApiToken`, `MarketOrder`, `MarketHistory`, `Recipe`) herdam de `Base` aqui definida.
- `get_session` é a dependency que os routers vão usar via `Depends(get_session)`.

## Bibliotecas/dependências
- `uv add sqlalchemy[asyncio]` (2.0+)
- `uv add "asyncpg>=0.31.0"` (versão mínima obrigatória pra Python 3.13/3.14)

## Depende de
Task 03 (configuração — usa `settings.database_url`).

## Testes manuais
1. Com o Postgres do docker-compose (task 04) rodando:
   ```bash
   uv run python -c "
   import asyncio
   from src.database import engine
   async def check():
       async with engine.connect() as conn:
           print('conectado OK')
   asyncio.run(check())
   "
   ```
   Deve imprimir "conectado OK" sem erro.

## Testes automatizados
- `tests/test_database.py`: testa que `get_session()` produz uma sessão válida (usando a fixture de Postgres via testcontainers da task 20) e que uma query simples (`SELECT 1`) funciona.

**Nota (implementado em 2026-08-21)**: a task 20 (testcontainers) ainda não existe, então os testes desta task rodam contra o Postgres local do docker-compose (task 04) — funções `sync` que chamam `asyncio.run()` internamente, sem `pytest-asyncio` (também adiado pra task 20).

**Gotcha real encontrado (vale a pena qualquer um saber, inclusive pra task 20)**: no Windows, o `engine` do SQLAlchemy é um singleton com pool de conexões asyncpg. Cada `asyncio.run()` cria um event loop novo — uma conexão aberta no loop de um teste não sobrevive (nem consegue ser limpa direito) quando o pool tenta reusá-la no loop de outro teste, e estoura `RuntimeError: Event loop is closed` / `AttributeError: 'NoneType' object has no attribute 'send'` na hora de terminar a conexão antiga. **Correção**: chamar `asyncio.run(engine.dispose())` ao final de cada teste que usa o `engine`/`async_session_maker` global, garantindo que nenhuma conexão fique pendurada entre um loop e outro. Quando a task 20 configurar `pytest-asyncio` com um event loop compartilhado por sessão de teste (em vez de um `asyncio.run()` novo por teste), esse problema tende a sumir sozinho — mas vale manter o `dispose()` em mente se ele reaparecer.

**Atualização (2026-08-21, durante a task 08)**: o padrão acima (`asyncio.run(_run()); asyncio.run(engine.dispose())` em duas linhas soltas) tinha um bug — se `_run()` levantasse exceção, o `dispose()` nunca rodava, deixando a conexão pendurada e quebrando o teste seguinte em cascata. Extraído um helper `tests/utils.py::run_async()` que faz isso com `try/finally` de verdade — todos os testes desta task e das seguintes devem usar `run_async(coro)` em vez de repetir o padrão manual.
