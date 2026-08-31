# 28 — Retomada dos snapshots e do preço atual (20.4-20.11)

## Objetivo

Retomar a extensão transversal 3.1 da Fase 3, agora sobre a arquitetura corrigida, em vez de
sobre os motores que esta fase substituiu.

## Por que

A extensão [20 — snapshots e preços atuais](../frontend/20-snapshot-precos-atuais.md) tem 11
tasks; as três primeiras estão concluídas (contrato de snapshot, envio pelo client Go, projeção
da última observação) e oito continuam abertas:

- 20.4 Reconciliação do estado atual
- 20.5 Serviço único de preço atual
- 20.6 Invalidação de cache e pub/sub
- 20.7 Política de frescor
- 20.8 Estados do frontend
- 20.9 Migração dos motores de cálculo
- 20.10 Testes automatizados
- 20.11 Validação real no jogo

Executá-las **antes** desta fase seria trabalho perdido: 20.9 migraria motores que as tasks 02 e
03 reescrevem; 20.8 desenharia estados de frontend que as tasks 14 e 21-24 refazem; 20.6 depende
da decisão de pub/sub da task 08; e 20.5 ("serviço único de preço atual") é literalmente a
camada "backend só traz preço" que esta fase adota como arquitetura.

Por isso a ordem foi invertida: primeiro a fundação, depois os snapshots.

## O que implementar

1. Revisar cada uma das oito specs contra o estado real do código **depois** desta fase, como a
   skill `/implementar-task` exige — várias premissas mudaram.
2. Reconciliar 20.5 com a decisão de arquitetura desta fase: o "serviço único de preço atual"
   passa a ser também a fonte que alimenta a camada "e se" do cliente (task 23).
3. Reconciliar 20.6 com o resultado da task 08 (pub/sub entregue ou removido).
4. Reconciliar 20.9 com os motores novos (tasks 02 e 03) — a migração dos cálculos já terá
   acontecido em boa parte.
5. Reconciliar 20.8 com a linguagem visual da task 14 e os componentes da task 20.
6. Executar 20.4, 20.7, 20.10 e 20.11 conforme as specs revisadas.
7. Atualizar o checklist em `docs/tasks/frontend/README.md`.

## Depende de

Todas as tasks anteriores desta fase.

## Testes automatizados

Definidos pelas specs 20.4-20.10 revisadas.

## Testes manuais

A validação em jogo real da 20.11, junto do gate final da task 19 da Fase 3.
