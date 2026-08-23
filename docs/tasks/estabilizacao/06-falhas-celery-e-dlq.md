# 06 — Falhas Celery e DLQ

> Corrige `R06` de [../../05-revisao-fases-0-a-2.md](../../05-revisao-fases-0-a-2.md).

## Objetivo

Garantir que erro inesperado ou falha permanente nunca seja confirmado como sucesso e possa ser
diagnosticado/reprocessado sem depender apenas de logs.

## Por que

Os wrappers de ingest e jobs periódicos capturam `Exception`, logam e retornam. Para o Celery a
task terminou normalmente: RabbitMQ remove a mensagem e não há retry, estado de falha ou DLQ.

## Política de falhas

- Erro transitório conhecido: retry exponencial limitado, como hoje.
- Payload inválido: deve ter sido rejeitado na API pela task 07; se aparecer no worker, é falha
  permanente/quarentena, não retry infinito.
- Bug/invariante quebrada: task falha, conserva stack trace e vai para mecanismo de quarentena.
- Queda do processo no meio: mensagem não recebe ACK prematuro.

## O que implementar

1. Remover o `return` dos `except Exception`; logar com contexto e relançar.
2. Definir mecanismo real de DLQ/quarentena compatível com Celery 5.6 + RabbitMQ usado no projeto.
   Durante a implementação, consultar documentação oficial atual e registrar a escolha: DLX da
   fila, task de quarentena ou signal de falha com persistência no Postgres. Não criar um híbrido
   sem semântica de ACK testada.
3. Guardar metadados mínimos: task, tópico, user/token id não secreto, realm, número de tentativas,
   tipo/resumo do erro, timestamp e referência ao payload. Nunca registrar token cru.
4. Criar procedimento/command de listar e reprocessar com idempotência; reprocessamento manual
   precisa de autorização e auditoria.
5. Aplicar mesma política aos jobs de rollup/poda, distinguindo falha do job de quarentena de dado.
6. Configurar `task_reject_on_worker_lost`/ACK/retry somente depois de teste real no RabbitMQ; não
   confiar no nome da opção como prova de comportamento.

## Depende de

Task 01. Task 07 assume esta classificação de falhas.

## Testes automatizados

- Exceção inesperada produz estado `FAILURE`, nunca `SUCCESS`.
- Erro transitório tenta o número previsto e depois fica observável.
- Mensagem em quarentena contém contexto, não token/senha.
- Reprocessar o mesmo payload não duplica fatos.
- Matar worker durante task longa e provar redelivery em RabbitMQ real.

## Testes manuais

Subir worker real, provocar indisponibilidade e erro permanente, inspecionar RabbitMQ/registro de
quarentena e executar o procedimento de reprocessamento.

