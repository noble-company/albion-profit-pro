# Operação Celery e exemplo de Swarm

Decisão operacional da Fase 2.5, task 11. O caminho quente de ingest não compartilha mais slots
com rollup/poda, e resultados fire-and-forget não geram estado descartável no Redis.

## Filas e processos

As exchanges e filas são direct, duráveis e declaradas explicitamente; criação automática de
nomes desconhecidos está desabilitada.

| Fila | Tasks | Worker de produção | Concorrência inicial |
|---|---|---|---:|
| `ingest` | `ingest.*` | `worker-ingest` | 4 |
| `maintenance` | `prices.*` | `worker-maintenance` | 1 |
| `quarantine` | `quarantine.*`, monitor de filas | `worker-quarantine` | 1 |

Todos usam prefetch 1 e ACK tardio. A separação de quarentena é obrigatória: se ela ficasse junto
da manutenção, um rollup lento também atrasaria o registro durável de falhas definitivas.

Os limites são 120 s soft/150 s hard para ingest e 1.800 s soft/1.860 s hard para manutenção. Uma
exceção antes do `commit` fecha a sessão com rollback. Se o hard limit matar o processo, a conexão
PostgreSQL cai e a transação aberta é abortada; `task_reject_on_worker_lost=True` causa redelivery.
Se o commit já terminou mas o ACK ainda não, a redelivery converge porque essas tasks são
idempotentes.

## Resultados e observabilidade

`task_ignore_result=True` e `task_store_errors_even_if_ignored=False` são o default. Nenhuma task
atual possui consumidor de `AsyncResult`; falhas definitivas continuam auditadas na quarentena do
PostgreSQL. `result_expires=3600` limita qualquer opt-in futuro.

Eventos do Celery e logs estruturados registram publicação, fila, idade ao iniciar, tentativa,
retry, falha, estado final e duração. O beat publica `operations.log_queue_metrics` a cada minuto
na fila de quarentena, registrando mensagens e consumidores das três filas. Para um snapshot:

```bash
python -m scripts.celery_queues
```

## Readiness

`/health` responde apenas pelo processo. `/ready` exige PostgreSQL, versão ativa do dataset,
Redis e RabbitMQ. Redis é obrigatório neste papel de API porque autenticação/ingest usam rate
limit fail-closed, além do cache; RabbitMQ é obrigatório para não devolver sucesso a um ingest que
não pode ser publicado. Detalhes de URLs/credenciais ficam somente nos logs sanitizados.

## Stack de referência

[`backend/stack.production.example.yml`](../backend/stack.production.example.yml) materializa:

```text
migrate ──► seed ──► api / worker-ingest / worker-maintenance / worker-quarantine / beat
```

O Swarm inicia serviços de forma assíncrona. Por isso o YAML não finge uma garantia com
`depends_on`: `seed` aguarda o head do Alembic, enquanto API/workers/beat aguardam o dataset ativo
antes de executar seu processo real. `migrate` continua one-shot, e o seed é idempotente.

As credenciais são secrets externos contendo os valores completos e são carregadas pelos campos
`*_FILE` através de `scripts.run_with_secrets`. A imagem continua não-root. O router Traefik da API
inclui `buffering.maxRequestBodyBytes=10485760`, igual ao limite do Starlette.

Antes do deploy, copie o exemplo e ajuste obrigatoriamente:

- `profitpro_services` para as redes overlay reais de PostgreSQL/Redis/RabbitMQ;
- `traefik_public`, entrypoint, domínio, TLS e cadeia de middlewares;
- nomes dos secrets externos e imagem imutável em `BACKEND_IMAGE`;
- `TRUSTED_PROXY_CIDRS` somente com peers/rede reais do Traefik;
- `CORS_ORIGINS` com os domínios reais.

O beat tem uma réplica, atualização `stop-first` e um worker de manutenção com concorrência 1. Um
restart pode reenfileirar um job idempotente na fronteira do horário, mas não cria dois jobs de
manutenção concorrentes neste stack.

Para reaplicar migration/seed numa atualização que não mudou o serviço one-shot, force a nova
execução e aguarde sucesso antes de liberar tráfego:

```bash
docker service update --force <stack>_migrate
docker service update --force <stack>_seed
```

O arquivo é uma referência validada sintaticamente, não o stack final do servidor. Não faça
deploy antes de substituir todas as redes, secrets e labels pelos padrões reais do ambiente.
