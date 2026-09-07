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

## Estado da implementação

**Concluída** (2026-09-06). Backend: `ruff` limpo, `pytest tests/` **350 passed (+4)**.

### A arquitetura foi a projeção, não snapshots persistidos

A revisão da 20.3 já tinha escolhido a **projeção da última observação**
(`latest_order_observation_filter`) no lugar da tabela de snapshots que 20.4-20.6 pressupunham.
A Fase 3.5 construiu tudo sobre essa projeção. Por isso esta task é sobretudo reconciliação:

| Sub-task | Resolução | Onde |
|---|---|---|
| 20.4 Reconciliação transacional | **Continua aberta, bloqueada no client Go.** Inativar ordem por ausência precisa do client emitir snapshot vazio + `Scope` explícito, adiado de propósito na 20.2. No interino: expiração + janela de frescor + projeção. | — |
| 20.5 Serviço único de preço atual | Entregue | Fase 3.5/05 (`src/craft/quotes.py`) + 20.3; consumido pela camada "e se" (3.5/23) |
| 20.6 Invalidação + pub/sub | **Superada** — pub/sub removido (Opção B) | Fase 3.5/08 |
| 20.7 Política de frescor | Entregue — `age_seconds`, `coverage.stale`, `require_complete`, warning `dado_velho`, teto de frescor na UI | Fase 3.5/03, 3.5/07, 3.5/22 |
| 20.8 Estados do frontend | Entregue — `EstadoVazio`/`EstadoErro`, `RankingCoverage`, `formatarIdade` | Fase 3.5/14, 3.5/21-25 |
| 20.9 Migração dos motores | Entregue — Flip/Refino/Craft/Calculadora sobre a projeção | Fase 3.5/02, 3.5/03, 3.5/05 |
| 20.10 Testes | Substituição/remoção/vazio/frescor já cobertos; critérios de aceite 20.1/20.3 **no limite HTTP** adicionados aqui | `tests/prices/test_current_price_projection_acceptance.py` (novo) + `test_service.py`, `test_quotes.py`, `test_simulate_router.py`, `test_flips.py` |
| 20.11 Validação real no jogo | **Humana, no gate da task 19** | — |

### O que mudou

- **`backend/tests/prices/test_current_price_projection_acceptance.py`** (novo, 4 testes) — os
  critérios de aceite do 20.1/20.3 exercitados pelos motores que o usuário toca:
  - `/opportunities/flips` cota a observação nova (900), não as ordens da observação anterior
    (50 e 1000) — verificado vermelho alargando a janela da projeção.
  - `/opportunities/flips` com todo lado fora da janela → retorna a linha **com warning
    `dado_velho`** (nunca cálculo silencioso) e `require_complete=true` a exclui.
  - `/craft/simulate` cota o ingrediente pela observação atual (250), não pela barata de 20 min
    atrás (100) — verificado vermelho.
  - `/craft/simulate` com ingrediente só em observação velha → `total: null` + `dado_velho` +
    cenário sem lucro.
- **Docs reconciliados** — `docs/tasks/frontend/README.md` (checklist 20.4-20.11 com o estado
  real e o "onde"), `docs/tasks/frontend/20-snapshot-precos-atuais.md` (nota de reconciliação
  no topo).

### Desvios da spec

- **20.4 não foi implementada** — depende de trabalho no client Go que a 20.2 adiou de
  propósito ("a correlação de consulta será implementada depois"). Fica aberta com o
  pré-requisito registrado, não empurrada com uma meia-implementação.
- **20.6 entregue como remoção**, não como implementação de pub/sub — decisão da Fase 3.5/08.
- **20.11 não executada** — in-game, fica no gate da task 19 (a própria spec manda isso).

### Pendente pra você testar

- **20.11** (in-game, no gate da task 19): mapear um mercado, comprar/vender uma ordem, mapear
  de novo → a ordem removida não pode aparecer em Market Flip, Refino, Craft nem Calculadora; o
  preço novo aparece em todas, inclusive em cidades diferentes e no Black Market.
