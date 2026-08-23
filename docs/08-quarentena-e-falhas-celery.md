# Quarentena e falhas definitivas do Celery

Decisão operacional da Fase 2.5, task 06. O objetivo é impedir que erro permanente seja
registrado como sucesso silencioso e permitir inspeção e reprocessamento controlado.

## Decisão

A quarentena é **aplicacional e persistida no PostgreSQL**. Não usamos uma DLX bruta do RabbitMQ
como fonte de verdade: com `task_acks_late`, o Celery ainda confirma por padrão uma task que
termina em falha, e uma mensagem morta do broker não contém o contexto enriquecido da exceção,
tentativas, usuário, token identificador e traceback sanitizado.

`QuarantinableTask.on_failure` publica `quarantine.persist_task_failure`. Essa segunda task grava
`quarantined_task` e repete indefinidamente quando PostgreSQL/Redis estão temporariamente
indisponíveis. A task original permanece em estado `FAILURE`; ela nunca converte bug permanente
em sucesso.

| Situação | Comportamento |
|---|---|
| Sucesso | ACK após a execução. |
| Falha transitória conhecida | Retry exponencial com jitter, no máximo 5 retries na task original. |
| Retries esgotados ou erro permanente | `FAILURE`; contexto sanitizado é publicado e persistido na quarentena; a falha normal recebe ACK para não criar poison loop. |
| Processo do worker morre durante a execução | `task_reject_on_worker_lost=True` rejeita e reentrega a mensagem não confirmada. As tasks cobertas são idempotentes. |
| Banco da quarentena indisponível | A task de persistência continua repetindo, sem limite de retries. |
| Bug na própria persistência | A task de persistência falha e gera log crítico; ela não usa a base de quarentena para evitar recursão infinita. |

Essa configuração segue a semântica documentada pelo
[Celery 5.6](https://docs.celeryq.dev/en/stable/userguide/configuration.html) para ACK tardio,
ACK em falha e perda do processo do worker. Uma DLX continua útil futuramente para expiração,
limite de fila ou rejeição explícita, conforme a
[documentação do RabbitMQ](https://www.rabbitmq.com/docs/dlx), mas não substitui este registro.

## Dados e segurança

Cada falha registra ID original do Celery, nome/tipo/tópico da task, número de tentativas,
identificadores não secretos de usuário e API token, realm, resumo, traceback, instante e payload
com SHA-256. A migration também cria `quarantine_replay`, que audita ator, nova task publicada,
status e erro de publicação.

Antes da publicação e novamente antes da gravação:

- chaves com `authorization`, `password`, `secret` ou `token` são substituídas;
- valores `Bearer`, tokens `apk_...` e credenciais embutidas em URL são removidos;
- texto e traceback possuem limites de tamanho;
- o valor bruto do token nunca entra nos argumentos do Celery; somente `api_token_id`.

O realm é preservado no registro e no replay. Falhas históricas anteriores à Task 03 podem ter
realm nulo; o sistema não inventa esse dado.

## Operação

Executar a partir de `backend/`:

```powershell
uv run python -m scripts.quarantine list
uv run python -m scripts.quarantine list --status all --limit 100
uv run python -m scripts.quarantine reprocess <uuid> --actor <operador> --confirm <mesmo-uuid>
```

O reprocessamento é restrito ao operador com acesso ao shell e aos segredos do backend, exige
confirmação literal do UUID, aceita somente nomes de task em whitelist e gera auditoria no banco.
Uma falha que já saiu de `pending` não pode ser reenfileirada novamente pelo mesmo comando. Os
handlers de fatos usam upsert/chaves naturais, então uma redelivery ou execução repetida converge
sem duplicar o fato.

A Task 11 separou fisicamente as filas `ingest`, `maintenance` e `quarantine` e desativou
resultados por default. Os processos e comandos estão em
[`09-operacao-celery-e-swarm.md`](09-operacao-celery-e-swarm.md). PostgreSQL continua sendo a fonte
de verdade; RabbitMQ é transporte.

## Validação

A suíte cobre falha permanente, esgotamento das seis tentativas totais, sanitização de segredos,
persistência idempotente, falha de manutenção, whitelist/auditoria/replay, round-trip da migration e
queda de um processo Celery real. O último teste inicia um worker contra RabbitMQ e Redis reais,
interrompe o processo durante uma task com ACK tardio e confirma que um segundo worker recebe a
mesma mensagem.
