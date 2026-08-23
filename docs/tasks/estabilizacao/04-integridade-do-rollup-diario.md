# 04 — Integridade do rollup diário

> Corrige `R04` de [../../05-revisao-fases-0-a-2.md](../../05-revisao-fases-0-a-2.md).

## Objetivo

Impedir que o job horário sobrescreva um dia com somente a parte dele ainda dentro de uma janela
móvel de 48 horas.

## Por que

O cutoff atual preserva hora/minuto. Ao agrupar por `date` e fazer upsert, o primeiro dia da janela
é parcial; a cada execução mais buckets saem e o total diário diminui. Depois ele envelhece e fica
corrompido de forma permanente, contaminando o mensal.

## O que implementar

1. Calcular a janela por limites de **dias completos em UTC**, incluindo folga para buckets
   atrasados. Não usar `now - timedelta(days=N)` diretamente como início do agrupamento diário.
2. Recalcular/upsert somente os dias cobertos integralmente pelo recorte escolhido; documentar o
   tratamento do dia corrente parcial.
3. Criar rotina segura de reparo para diários/mensais já derivados dos buckets ainda retidos.
4. Garantir ordem operacional: reparar diário antes de mensal; poda só remove bruto depois que o
   rollup necessário estiver confirmado.
5. Se a task 03 já estiver pronta, todo agrupamento inclui realm.

## Depende de

Nenhuma task de código. Deve ser compatível com a task 03 quando ela entrar.

## Testes automatizados

- Congelar relógio no meio do dia e criar buckets nos três dias da borda.
- Duas execuções com uma hora de diferença não reduzem o total do dia anterior.
- Bucket atrasado corrige o dia e o mensal sem duplicação.
- Reparo é idempotente; média continua ponderada por volume.

## Testes manuais

Comparar, por SQL, soma dos buckets de 6h de vários dias com `market_history_daily` antes/depois do
reparo e executar o job duas vezes.

## Resultado da implementação (2026-08-23)

- O reparo usa limites de dias completos em UTC. O dia corrente nunca é materializado e o dia que
  contém a borda da retenção funciona como folga integral: ele é removido dos derivados, mas não é
  reconstruído porque instalações antigas podem já ter podado parte dele.
- Em cada execução, diários recuperáveis são apagados e reconstruídos na mesma transação a partir
  dos buckets de 6h. Em seguida, os meses afetados são reconstruídos a partir dos diários, mantendo
  média ponderada por volume e isolamento por realm.
- O beat não agenda mais diário e mensal como jobs concorrentes. O job horário executa a sequência
  diário → mensal; a task mensal foi mantida para replay/operação, mas também faz a sequência
  completa.
- A poda de buckets de 6h foi alinhada à meia-noite UTC e sua task executa reparo diário → mensal
  antes de remover o bruto. O offset operacional mudou para 02:30 UTC.
- Derivados anteriores à retenção do bruto são preservados: sem os buckets-fonte não existe reparo
  matematicamente seguro. A rotina corrige somente o intervalo comprovadamente reconstruível.
- Testes com relógio determinístico cobrem borda, duas execuções separadas por uma hora, bucket
  atrasado, diário/mensal, idempotência, média ponderada, realm e reparo antes da poda.
