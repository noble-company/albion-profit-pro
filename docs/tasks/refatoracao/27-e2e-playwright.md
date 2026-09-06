# 27 — E2E Playwright

> Corrige `A03`. Substitui a task 18 da Fase 3, que nunca começou.

## Objetivo

Ter a validação de ponta a ponta que o projeto já configurou e nunca escreveu, com API,
PostgreSQL, Redis e RabbitMQ reais.

## Por que

`frontend/playwright.config.ts` existe e está configurado: `testDir: './e2e'`, `baseURL`
`http://127.0.0.1:4173`, `webServer` rodando `npm run preview`, projeto chromium, trace na
primeira repetição. **A pasta `e2e/` não existe.** `npm run test:e2e` falha imediatamente.

A task 18 da Fase 3 (`resiliencia-e2e`) segue aberta, e o README da fase estabelece que "teste
unitário do frontend usa MSW; E2E usa API, PostgreSQL, Redis e RabbitMQ reais".

Depois das tasks 21-25, isso deixa de ser desejável e passa a ser necessário: a suíte unitária
usa MSW, e MSW já provou (`F07`) que pode mentir sobre a integração.

## O que implementar

1. Criar `frontend/e2e/` com a estrutura e os fixtures de sessão.
2. Subir a stack real (`backend/docker-compose.yml` + API + worker) para os testes, com dados
   semeados determinísticos — reaproveitar o seed estático já reproduzível
   (`backend/scripts/seed_static_data.py`) e um fixture de mercado a partir dos payloads reais
   em `backend/tests/fixtures/wire/`.
3. Fluxos que precisam estar cobertos:
   - registrar, logar, escolher realm e chegar ao Market Flip;
   - **recarregar a página autenticado e continuar logado** (regressão de `F07` no ambiente
     real, onde o MSW não pode mascarar);
   - filtrar oportunidades, paginar e conferir que a ordenação se mantém entre páginas (`F08`);
   - mudar premium/retorno e confirmar que **nenhuma requisição** sai (`task 23`);
   - abrir o detalhe de uma oportunidade e ver os quatro cenários;
   - criar e revogar um token do client;
   - estados de borda: sem cobertura, backend fora do ar, sessão expirando durante a navegação.
4. Decidir a estratégia de CI: rodar E2E em toda alteração ou apenas no fechamento de fase,
   dado o custo de subir a stack.
5. Registrar o procedimento reproduzível no README da fase, como foi feito na task 2.5/08.

## Depende de

Tasks 21-26.

## Testes automatizados

Esta task **é** a suíte E2E. Critério de pronto: `npx playwright test` verde com a stack real, e
o teste de recarregamento falhando de forma verificável se a correção da task 16 for revertida.

## Testes manuais

Executar a suíte numa máquina limpa, seguindo apenas o README, para confirmar que o procedimento
é reproduzível fora deste ambiente.

## Estado da implementação

**Concluída** (2026-09-06). `npx playwright test` **10/10 verde** contra a stack real
(compose + API + PostgreSQL + Redis + RabbitMQ), na máquina de dev. O teste de recarregamento
foi verificado vermelho: revertendo o inicializador de sessão da task 16
(`getAccessToken() ? 'loading' : 'unauthenticated'` → `'unauthenticated'`), `session.spec.ts`
falha exatamente na asserção do reload (`Received: /login?next=%2F`).

### O que mudou

- **`frontend/e2e/`** — a pasta que o `playwright.config.ts` já esperava:
  - `helpers.ts`: `uniqueEmail()` (registro é irreversível, um e-mail por rodada),
    `registerAndLogin()` e `chooseRealm()` pela própria UI.
  - `smoke.spec.ts`: registrar → logar → escolher realm → Market Flip com o dado semeado.
  - `session.spec.ts`: recarregar autenticado continua logado + navegação direta a rota
    protegida sobrevive ao reload (**regressão de `F07`**).
  - `opportunities.spec.ts`: filtro por tier reduz o conjunto e "Limpar" restaura;
    paginação com ordenação **total e estável** entre páginas, sem sobreposição (`F08`);
    mudar premium/retorno no Refino **não dispara requisição** (task 23); "Analisar" abre o
    drawer com os quatro cenários e `Esc` fecha.
  - `tokens.spec.ts`: gerar um token (modal trava até copiar) e revogar.
  - `edge.spec.ts`: filtro sem resultado → estado vazio honesto; `route.abort` em
    `/opportunities/**` → `EstadoErro`, não tela branca; 401 forjado no meio da navegação →
    redireciona pro login com "Sua sessão expirou".
  - `README.md`: procedimento reproduzível (modelo da task 2.5/08).
- **`backend/scripts/seed_e2e_market.py`** (novo) — semeia `market_order` **sem worker
  Celery** (chama `src.ingest.service.save_market_orders`, o mesmo caminho de escrita do
  ingest, então a transformação fio→banco é a de produção). Fontes: os payloads reais de
  `tests/fixtures/wire/marketorders-real-*.json` (com `Expires` deslocado 14 dias pra frente
  a cada execução) + um flip determinístico (`T4_FIBER_LEVEL3@3`, Fort Sterling → Caerleon,
  ROI 32%) + um refino determinístico (`T4_CLOTH` em Caerleon, receita real 2×T4_FIBER +
  1×T3_CLOTH) + volume sintético (recurso × tier) pra exercitar paginação. `--rebuild-ranking`
  reconstrói `recipe_ranking` síncrono (sem beat).
- **`playwright.config.ts`** — `workers: 1` / `fullyParallel: false` (DB único e compartilhado),
  `reuseExistingServer: !CI`, `webServer` faz `npm run build && npm run preview`, reporter
  `github` no CI.
- **`.github/workflows/frontend-e2e.yml`** (novo) — o procedimento inteiro em
  `workflow_dispatch` + tag `fase-*`. **Não** roda em todo push (subir a stack custa minutos)
  — decisão do item 4 da spec.
- **Isolamento do runner de teste** — `vite.config.ts` restringe o Vitest a
  `src/**/*.{test,spec}` (senão ele tentaria rodar os `e2e/*.spec.ts`); `tsconfig.e2e.json`
  novo, referenciado pelo `tsconfig.json`, põe `e2e/` sob `typecheck` e `lint`.

### Desvios da spec

- **Dado de mercado é semeado por script, não por worker de ingest.** No Windows o Celery
  prefork estoura `WinError 5` (`W9`); a suíte não sobe worker nenhum. O script reusa o
  caminho de escrita do ingest (`save_market_orders`), não uma cópia — a transformação
  continua sendo a de produção.
- **O flip e o refino "de verdade" têm spread sintético.** Preços na ordem de grandeza real
  (dos fixtures capturados), mas a margem é deliberada pra garantir uma oportunidade
  lucrativa estável pras asserções. Documentado no cabeçalho de `seed_e2e_market.py`.
- **CI:** `workflow_dispatch` + fechamento de fase, não todo PR.

### Pendente pra você testar

- **Máquina limpa:** `git clone` num diretório novo → seguir só o `frontend/e2e/README.md` →
  `npm run test:e2e` verde, sem depender desta máquina. (A primeira execução precisa de
  egress pra `raw.githubusercontent.com` — o seed estático baixa os dumps da revisão fixada.)
- **CI:** disparar o workflow `Frontend E2E` manualmente no GitHub e confirmar verde.
