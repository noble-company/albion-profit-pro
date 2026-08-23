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
   operacional. Ajustar ao padrão Swarm/Traefik do usuário quando fornecido.
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

