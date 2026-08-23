# 11 — Filas e operação Celery

> Corrige `R11` de [../../05-revisao-fases-0-a-2.md](../../05-revisao-fases-0-a-2.md).

## Objetivo

Isolar o caminho quente de ingest dos jobs pesados, reduzir churn no Redis e materializar a ordem
completa de processos necessária em produção.

## Por que

Ingest, rollup e poda usam a fila default. Uma agregação/delete lenta pode atrasar dados recém-
capturados. Tasks fire-and-forget também persistem resultados inúteis. O plano menciona worker e
beat, mas ainda não existe stack real garantindo `migrate/seed/api/worker/beat`.

## O que implementar

1. Definir filas/rotas explícitas, no mínimo `ingest` e `maintenance`; avaliar fila separada de
   quarentena da task 06. Declarar exchanges/queues de forma reproduzível, não depender de criação
   acidental pelo primeiro worker.
2. Workers dedicados com concorrência/prefetch apropriados ao perfil. Ingest mantém baixa latência;
   manutenção não compete por slot nem derruba o banco com concorrência excessiva.
3. Configurar `task_ignore_result=True` por padrão e habilitar resultado somente onde houver
   consumidor real. Definir expiração para qualquer resultado mantido.
4. Aplicar time limits apenas com entendimento transacional; task interrompida não pode confirmar
   commit parcial como sucesso.
5. `/ready` deve refletir dependências necessárias por papel. API de ingest precisa sinalizar
   indisponibilidade do broker sem transformar Redis opcional em requisito errado; documentar
   readiness separada se necessário.
6. Criar exemplo de stack/compose de produção com serviços `migrate`, `seed`, `api`,
   `worker-ingest`, `worker-maintenance` e `beat`, healthchecks, usuário não-root, secrets e ordem
   operacional. Ajustar ao padrão Swarm/Traefik do usuário quando fornecido. No router da API,
   materializar o middleware de buffering com
   `maxRequestBodyBytes=10485760`, igual ao limite aplicado pelo Starlette (Task 07).
7. Garantir uma única instância de beat ou scheduler com liderança; restart não duplica execução.
8. Adicionar métricas/logs de tamanho/idade das filas, retries, falhas e duração dos jobs.

## Depende de

Tasks 06 e 10.

## Testes automatizados

- Cada task roteia para a fila correta.
- Rollup bloqueado não impede consumo de ingest em workers separados.
- Tasks de ingest não criam chaves de resultado no Redis.
- Ausência de RabbitMQ produz readiness/comportamento HTTP definido.
- Configuração Celery serializa apenas JSON e mantém ACK/retry definidos na task 06.

## Testes manuais

Subir todos os serviços, executar job pesado, enviar ingest e medir que ele continua sendo
consumido. Parar/reiniciar beat e confirmar ausência de duplicação concorrente.

## Só o humano pode validar

Fornecer convenções do stack Swarm, redes, secrets e labels Traefik reais.

## Implementação — 2026-08-23

- `src/celery_app.py` declara exchanges/filas duráveis `ingest`, `maintenance` e `quarantine`,
  desabilita filas acidentais e roteia explicitamente ingest, preços, quarentena e operação.
- Resultados são ignorados e erros não são armazenados no Redis; a quarentena PostgreSQL segue
  autoritativa. Eventos e logs cobrem publicação, idade, retries, falhas e duração.
- Ingest usa limites soft/hard de 120/150 s; manutenção usa 1.800/1.860 s. ACK tardio, rollback e
  redelivery idempotente preservam a semântica da Task 06.
- `/ready` passou a verificar RabbitMQ, além de PostgreSQL, dataset e Redis.
- `stack.production.example.yml` entrega os sete papéis pedidos mais `worker-quarantine`, necessário
  para consumir a fila criada na Task 06. Secrets são arquivos externos e a ordem é garantida por
  gates reais de migration/dataset, não por `depends_on`.
- Beat tem uma réplica e atualização `stop-first`; manutenção tem uma réplica/concorrência 1.
- O contrato operacional completo está em `docs/09-operacao-celery-e-swarm.md`.

### Validação executada

- `uv run pytest tests/ -q`: **229 passed**, um aviso preexistente do Testcontainers.
- Teste com dois workers reais: manutenção bloqueada não impediu o consumo de ingest.
- Task de ingest executada sem criar chave `celery-task-meta-*` no Redis.
- Readiness sem RabbitMQ retorna 503 sem vazar a URL; com as quatro dependências retorna 200.
- `docker stack config` aceitou o stack de referência e materializou o middleware de 10 MB.
- Imagem `profitpro-backend:task11` construída. Em ambiente temporário, migration, seed, API,
  três workers e beat subiram; `/ready` ficou verde, cada fila teve um consumidor e o beat voltou
  com uma única instância após restart. Os containers e a rede temporários foram removidos.

### Pendência operacional

Ainda depende do proprietário adaptar e validar as redes overlay, secrets e labels do Traefik no
Swarm real. O stack entregue é propositalmente um exemplo seguro, não presume nomes/credenciais do
servidor.
