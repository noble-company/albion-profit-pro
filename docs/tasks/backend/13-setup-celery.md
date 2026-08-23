# 13 — Setup do Celery

## Objetivo
App Celery configurado com RabbitMQ como broker, pronto pra receber tasks publicadas pelo router de ingest (task 16) e executá-las no processo worker separado.

## Por que
Decisão confirmada: Celery, apesar de não ter suporte oficial a Python 3.14 ainda — por isso todo o backend roda em 3.13 (task 01). É o motor que desacopla "receber o POST do client" de "gravar no Postgres", absorvendo os picos de rajada que o client manda (ex: 50 ordens de mercado de uma vez quando o jogador abre o mercado in-game).

## O que implementar
`src/celery_app.py`:
```python
from celery import Celery

from src.config import get_settings

settings = get_settings()

celery_app = Celery(
    "albion_profit_pro",
    broker=settings.rabbitmq_url,
    backend=settings.redis_url,  # result backend — usado só se quisermos consultar status de uma task depois; opcional pro nosso caso fire-and-forget
    include=["src.ingest.tasks"],  # onde as tasks de gravação (task 17) vão morar
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_acks_late=True,       # só confirma a task como concluída depois que ela rodar (não ao receber) — evita perder dados se o worker cair no meio
    worker_prefetch_multiplier=1,  # cada worker pega 1 task por vez da fila — evita um worker lento acumular um lote grande enquanto outros ficam ociosos
)
```

Notas de configuração:
- `task_acks_late=True` + `worker_prefetch_multiplier=1` é o par de configurações recomendado pra filas onde perder uma mensagem é inaceitável (nosso caso — perder dados de mercado captados é uma pena, mas silenciosa e ruim de detectar).
- `broker=settings.rabbitmq_url` aponta pro RabbitMQ do docker-compose local (task 04) em dev, e pro RabbitMQ real do servidor do usuário em produção (via env var).
- `backend=settings.redis_url` (result backend) é opcional pro nosso fluxo — as tasks de ingest são fire-and-forget (não precisamos consultar resultado depois). Mantido só porque é zero-custo e pode ser útil pra debug (`task.get()` durante desenvolvimento).

Entrypoint do worker (comando, não arquivo novo):
```bash
uv run celery -A src.celery_app.celery_app worker --loglevel=info
```

## Bibliotecas/dependências
- `uv add celery`

## Depende de
Task 03 (configuração — usa `settings.rabbitmq_url`/`settings.redis_url`), Task 04 (RabbitMQ local pra testar).

## Testes manuais
1. Com RabbitMQ do docker-compose rodando, iniciar o worker: `uv run celery -A src.celery_app.celery_app worker --loglevel=info` → deve conectar sem erro e mostrar "ready".
2. Abrir `http://localhost:15672` (painel RabbitMQ) → confirmar que a conexão do worker aparece em "Connections".
3. Criar uma task dummy temporária (`@celery_app.task def ping(): return "pong"`), chamar `ping.delay()` de um shell Python, confirmar no log do worker que ela rodou.

## Testes automatizados
- `tests/test_celery_app.py`: usa `celery_app.conf.update(task_always_eager=True)` (modo síncrono de teste, task roda na hora sem precisar de broker/worker real) pra confirmar que uma task simples executa e retorna o esperado, sem precisar de infra externa nesse teste específico. Testes de integração de verdade (com RabbitMQ real via testcontainers) ficam nas tasks 17/20.
