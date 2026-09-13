# 12 — E2E do núcleo do produto

> Corrige `P05`.

## Objetivo

Estender a suíte Playwright às telas que o produto existe para entregar, e decidir o que a suíte
protege de fato.

## Por que

A task 3.5/27 (`A03`) entregou uma suíte E2E legítima: `playwright.config.ts:23-28` builda e
serve de verdade, e `frontend-e2e.yml` sobe Postgres, Redis, RabbitMQ e a API reais. O problema
é o que ela cobre.

São 5 specs e 10 casos:

| Spec | Cobre |
|---|---|
| `smoke.spec.ts` | Registrar, logar, escolher realm, Market Flip |
| `session.spec.ts` | Reload autenticado (regressão de `F07`) |
| `opportunities.spec.ts` | Filtro, paginação, ordenação estável, detalhe |
| `tokens.spec.ts` | Criar e revogar token |
| `edge.spec.ts` | Sem cobertura, backend fora do ar, sessão expirando |

**Não há spec de Refino, Craft, Calculadora, Preços nem Demanda.** A calculadora de crafting é a
proposta central do produto — é o item 1 do "o usuário quer" em `docs/00-plano-macro.md:90`. O
workflow inclusive já semeia o ranking materializado
(`seed_e2e_market --rebuild-ranking --realm west`) exatamente para as telas de Refino/Craft, que
nenhum teste abre.

Isso não é detalhe de cobertura: `E01`, `E02`, `E03` e `E05` — os quatro defeitos de usuário
desta fase — estão todos em telas sem E2E. `F07` foi um bug que o MSW escondeu e só a E2E
travou; a mesma classe pode estar viva nas telas descobertas.

E há a questão de quando a suíte roda. `frontend-e2e.yml:6-11` dispara só em `workflow_dispatch`
e em tag `fase-*`. É decisão documentada e defensável pelo custo de subir a stack — mas o efeito
é que a única suíte que exercita integração real **não bloqueia merge**. Vale reavaliar agora que
ela vai cobrir o núcleo.

## O que implementar

1. Spec de **Calculadora**: escolher item, cidade e quantidade, submeter, conferir que o resultado
   aparece e que os quatro cenários batem com o `POST /craft/simulate`. Incluir o caminho de erro
   de validação da task 04.
2. Spec de **Refino e Craft**: abrir o ranking materializado, mexer nos controles "e se" (premium,
   retorno, estação, foco) e confirmar que os valores recalculam **sem requisição** — o
   `opportunities.spec.ts` já tem esse padrão de contador para o Market Flip. Incluir os valores
   que quebravam antes das tasks 01-03 (`36,7`, `1,5`, `150`) como regressão permanente.
3. Spec de **Preços e Demanda**: consultar um item semeado, filtrar por qualidade e encantamento,
   confirmar paginação e o gráfico de demanda.
4. Verificar que o seed determinístico (`scripts/seed_e2e_market.py`) cobre os dados que essas
   specs precisam; estender se faltar.
5. **Decidir a política de disparo.** Se a suíte passa a cobrir o núcleo, rodar só sob demanda
   deixa de fazer sentido — avaliar rodar em PR que toque `frontend/` ou `backend/src/craft/`,
   medindo o custo real de execução antes de decidir. Registrar a decisão no
   `frontend/e2e/README.md`, que hoje explica bem o procedimento manual.

## Depende de

Tasks 01-04 (as regressões plantadas precisam do comportamento corrigido) e task 11 (o retry
entra na spec de erro).

## Testes automatizados

A própria task é de teste. O critério é: reverter localmente qualquer uma das tasks 01, 02, 03
ou 05 faz uma spec E2E ficar vermelha. Se não fizer, a cobertura não é real.

## Testes manuais

Rodar `npm run test:e2e` localmente contra a stack real, conforme
[frontend/e2e/README.md](../../../frontend/e2e/README.md), e anexar o relatório do Playwright ao
bloco de estado.
