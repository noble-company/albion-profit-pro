# 22 — Observabilidade básica

> ⚠️ **Entrega parcial — revisada em 2026-08-22.** Os endpoints `/health` e `/ready` estão
> prontos, mas a parte de logging ficou só na configuração: **não existe uma única chamada
> `log.` em `src/`**. Pior, o `structlog.configure()` mora em `src/main.py`, que o **worker
> Celery nunca importa** — o log do worker sai sem estrutura nenhuma. O texto abaixo tratava o
> uso retroativo como "não bloqueante"; na prática isso deixou o pipeline de ingest sem
> observabilidade justamente onde ele falha em silêncio. Achado `P3` →
> [task 24](24-retry-e-logging-no-ingest.md).
>
> O `/ready` também devolve `f"erro: {e}"` sem autenticação, vazando host/usuário/banco.
> Achado `A3` → [task 33](33-hardening-http.md).


## Objetivo
Logging estruturado (`structlog`) em vez de `print`/logging padrão não-estruturado, e endpoints `/health` (o processo está de pé) e `/ready` (as dependências — Postgres/Redis/RabbitMQ — estão acessíveis) pra health-check do Traefik/Swarm.

## Por que
Logging estruturado (JSON) facilita filtrar/buscar logs depois em produção (ex: "todo log da task X que falhou pro user Y"), muito melhor que strings soltas. `/health`/`/ready` são o padrão esperado por orquestradores (Swarm, Kubernetes) pra saber se um serviço deve receber tráfego ou ser reiniciado — sem isso, o Traefik roteia tráfego pra uma instância que pode estar com o banco fora do ar.

## O que implementar
`uv add structlog`

Configuração básica em `src/main.py` (ou um `src/logging_config.py` próprio, se preferir separar):
```python
import structlog

structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.add_log_level,
        structlog.processors.JSONRenderer(),
    ],
)

log = structlog.get_logger()
```
Uso nas tasks/routers já implementados (retroativo — ajustar conforme conveniente, não é bloqueante): trocar qualquer `print`/`logging.info` solto por `log.info("evento", campo=valor)`.

Endpoints de health-check — `src/main.py`:
```python
from sqlalchemy import text

from src.cache.redis_client import get_redis
from src.database import async_session_maker


@app.get("/health")
async def health():
    """Só confirma que o processo está de pé — não checa dependências externas."""
    return {"status": "ok"}


@app.get("/ready")
async def ready():
    """Confirma que Postgres e Redis estão acessíveis — usado pelo orquestrador pra decidir se roteia tráfego."""
    checks = {}

    try:
        async with async_session_maker() as session:
            await session.execute(text("SELECT 1"))
        checks["postgres"] = "ok"
    except Exception as e:
        checks["postgres"] = f"erro: {e}"

    try:
        await get_redis().ping()
        checks["redis"] = "ok"
    except Exception as e:
        checks["redis"] = f"erro: {e}"

    all_ok = all(v == "ok" for v in checks.values())
    status_code = 200 if all_ok else 503
    return JSONResponse(content=checks, status_code=status_code)
```

Notas:
- `/health` e `/ready` **não** exigem autenticação (o orquestrador não tem token) — registrar isso explicitamente ao montar o router (não incluir na dependency de auth global, se houver uma).
- RabbitMQ não é checado em `/ready` da API — é o worker que depende dele diretamente; se quiser, um `/ready` equivalente pode ser adicionado como comando separado no processo do worker depois (não essencial pro MVP).

## Bibliotecas/dependências
- `uv add structlog`

## Depende de
Task 05 (banco), Task 14 (Redis). Pode ser feita a qualquer momento depois dessas duas — não bloqueia nem é bloqueada por auth/ingest/prices.

## Testes manuais
1. `curl localhost:8000/health` → `{"status": "ok"}`, sempre, mesmo com Postgres/Redis fora do ar.
2. `curl localhost:8000/ready` com tudo rodando → `200` com `{"postgres": "ok", "redis": "ok"}`.
3. Derrubar o Postgres (`docker compose stop postgres`) e repetir → `503` com o erro do Postgres explícito no corpo.
4. Conferir que os logs da aplicação saem em formato JSON (uma linha por evento, campos estruturados) em vez de texto solto.

## Testes automatizados
- `tests/test_health.py`: testa que `/health` sempre retorna 200, e que `/ready` retorna 200 quando as fixtures de Postgres/Redis (testcontainers, task 20) estão de pé — não há um teste automatizado fácil pro caminho "dependência fora do ar" sem derrubar o container de propósito no meio do teste (opcional, não obrigatório pra esta task).
