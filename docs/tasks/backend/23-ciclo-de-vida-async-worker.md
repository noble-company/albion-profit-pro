# 23 — Ciclo de vida async no worker Celery

> Corrige o achado **C1** de [../../04-revisao-fase-1.md](../../04-revisao-fase-1.md).
> **Bloqueia a Fase 2** — sem isso, o worker não sobrevive ao segundo payload do client.

## Objetivo
Fazer o worker Celery sobreviver a mais de uma task por processo, dando ciclo de vida correto
ao engine SQLAlchemy e ao cliente Redis dentro do `asyncio.run()` de cada task.

## Por que
`src/ingest/tasks.py:12` abre um event loop novo por task (`asyncio.run`), mas o engine
(`src/database.py:10`) e o Redis (`src/cache/redis_client.py:9`) são singletons criados no
import do módulo, com pool próprio. Ao fim da task 1 o loop fecha, mas as conexões asyncpg
voltam **abertas** pro pool, amarradas a um loop morto. A task 2 pega uma delas e estoura
`RuntimeError: ... attached to a different loop` / `Event loop is closed`.

O projeto já esbarrou nesse mesmo comportamento nos testes — `pyproject.toml:39` documenta que
um loop por teste "quebraria esses singletons no 2º teste em diante", e por isso a suíte usa
loop único de sessão. Em produção o worker faz o oposto: um loop por mensagem.

Isso nunca apareceu porque **nenhum teste exercita o wrapper síncrono da task**:
`tests/ingest/test_tasks.py` chama as corotinas internas direto, e `tests/ingest/test_router.py`
só publica na fila sem worker consumindo.

## O que implementar

### 1. Engine dedicado do worker, sem pool
Em `src/database.py`, além do engine da API (que continua com pool — o processo web tem loop
único e longo), expor um construtor de engine descartável:

```python
from sqlalchemy.pool import NullPool

def create_worker_engine():
    """Engine de vida curta pro worker Celery: cada task roda no seu proprio event loop
    (asyncio.run), entao conexoes NAO podem ser reaproveitadas entre tasks. NullPool
    garante que nada sobrevive ao fim do loop."""
    return create_async_engine(settings.database_url, poolclass=NullPool)
```

> **Implementado com um adicional:** `create_worker_engine` passa `connect_args={"server_settings":
> {"application_name": "albion-profit-pro-worker"}}` — sem isso, o `SELECT ... WHERE
> application_name LIKE '%worker%'` da seção "Testes automatizados" não teria como diferenciar
> conexões do worker das da API/testes (nada no projeto setava `application_name` antes).

### 2. `_run_async` passa a gerenciar os recursos
Em `src/ingest/tasks.py`, o wrapper cria engine + sessionmaker + Redis **dentro** do loop e
descarta tudo no `finally`. As corotinas `_process_*` passam a receber o `sessionmaker` (e o
Redis) por parâmetro em vez de importar o singleton — isso também torna elas testáveis sem
monkeypatch.

```python
def _run_async(fn):
    """Executa a logica async da task num loop proprio, criando e destruindo engine/Redis
    dentro dele. Ver task 23 e docs/04-revisao-fase-1.md (C1)."""
    async def _wrapper():
        engine = create_worker_engine()
        sessionmaker = async_sessionmaker(engine, expire_on_commit=False)
        redis = new_redis_client()
        try:
            return await fn(sessionmaker, redis)
        finally:
            await redis.aclose()
            await engine.dispose()
    return asyncio.run(_wrapper())
```

### 3. `src/cache/redis_client.py` ganha um construtor
Manter `get_redis()` (usado pela API, processo de loop único) e adicionar
`new_redis_client()` que devolve uma instância nova, sem cache global. As funções
`set_latest_price`/`get_latest_price`/`publish_price_update` passam a aceitar o cliente como
primeiro argumento em vez de chamar `get_redis()` por dentro.

> Alternativa considerada e descartada: manter um loop persistente por processo de worker
> (`worker_process_init` + `run_coroutine_threadsafe`). Resolve, mas adiciona uma máquina de
> estados que não precisamos no volume atual — o custo de abrir conexão por task é irrelevante
> perto do custo de rede do payload. Se o volume crescer, essa é a evolução natural.

## Bibliotecas/dependências
Nenhuma nova.

## Depende de
Nada — é a primeira da fila. Tasks 24-31 assumem esse ciclo de vida.

## Testes manuais
1. `docker compose up -d`, aplicar migrations.
2. Subir o worker: `uv run celery -A src.celery_app.celery_app worker --loglevel=info`.
3. Gerar token, e enviar **dois** POSTs seguidos pra `/marketorders.ingest` (usar
   `backend/tests/fixtures/wire/marketorders-real-t2fiber.json` como corpo).
4. **Antes da correção:** a 1ª task grava, a 2ª falha com erro de event loop. **Depois:** as
   duas gravam. Confirmar no Postgres com `SELECT count(*) FROM market_order`.

> Esse passo 4 é também a **confirmação empírica do C1**, que ainda não foi feita. Se a 2ª task
> passar sem erro antes da correção, o diagnóstico está errado e esta task precisa ser
> reavaliada antes de implementada.

## Testes automatizados
`tests/ingest/test_tasks_lifecycle.py` — o teste que faltava:

- Executar `process_market_orders(payload, user_id=...)` (o **wrapper síncrono**, não a
  corotina) **duas vezes seguidas** e afirmar que ambas gravam.
- Como o wrapper chama `asyncio.run`, ele não pode ser chamado de dentro de um teste `async`
  (a suíte roda em loop de sessão). Rodar num executor: `await asyncio.get_running_loop().run_in_executor(None, process_market_orders, payload, user_id)` — ou marcar o teste como
  síncrono (`def test_...`) e deixar o pytest-asyncio de fora dele.
- Afirmar também que não sobrou conexão pendurada: `SELECT count(*) FROM pg_stat_activity WHERE
  application_name LIKE '%worker%'` volta ao baseline depois das duas execuções.
