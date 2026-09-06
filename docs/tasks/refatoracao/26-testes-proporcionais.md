# 26 — Testes proporcionais no frontend

> Corrige `F12`.

## Objetivo

Ter cobertura onde está a lógica, para que a próxima refatoração não seja feita no escuro.

## Por que

O frontend tem **24 testes em 9 arquivos** para 5.220 linhas de aplicação. O backend tem 258
testes para 6.524 linhas. A diferença não é só de volume — é de **onde** a cobertura está:

- auth e formatters concentram quase tudo;
- `opportunities/pages.tsx` e `production-pages.tsx` somam 1.561 linhas e têm 205 linhas de teste;
- não há teste de ordenação, paginação, filtro, sincronia com URL ou dos hooks de dados;
- não há E2E (task 27).

E há o problema qualitativo já documentado em `F07`: um teste que passa por causa de um mock
permissivo, escondendo um bug real de produção. Volume de teste não substitui teste honesto.

## O que implementar

1. **Handlers MSW honestos** (iniciado na task 16): exigir `Authorization` nas rotas
   autenticadas, validar os parâmetros de query recebidos e devolver payloads no formato exato do
   OpenAPI. Um handler que ignora a requisição é um teste que não testa.
2. **Isolamento entre casos:** `queryClient` novo por teste (hoje `src/test/render.tsx` usa o
   singleton da aplicação) e reset do estado de sessão do módulo.
3. Testes para a lógica que hoje está descoberta:
   - módulo monetário e vetores dourados (task 18) — a peça mais crítica;
   - projeção "e se" do cliente (task 23), comparada ao backend;
   - sincronia de filtros com a URL, ida e volta;
   - paginação: primeira página, última, além do fim, conjunto vazio;
   - estados de borda: sem cobertura, dado velho, profundidade insuficiente, erro de rede,
     429, sessão expirada no meio da navegação;
   - hooks de dados: dedup, cache, cancelamento no desmonte, polling só com aba visível.
4. Definir e medir uma meta de cobertura para os módulos de lógica (`lib/`, `api/`, hooks),
   sem perseguir número em componente de apresentação.
5. Adicionar ao CI a execução de `lint`, `typecheck` e `test` do frontend, se ainda não houver.

## Depende de

Tasks 15-25.

## Testes automatizados

Esta task **é** os testes. O critério de pronto:

- Cada teste novo é verificado vermelho antes de ficar verde (escrito contra o defeito, não
  depois da correção).
- Nenhum handler MSW responde a requisição autenticada sem checar credencial.
- Cada caso roda isolado: a suíte passa com `--sequence.shuffle`.
- A meta de cobertura definida é atingida nos módulos de lógica.

## Testes manuais

Nenhum. A validação é a suíte.

## Estado da implementação

**Concluída** (2026-09-06). Frontend: `lint` 0 erros (4 warnings pré-existentes) ·
`typecheck` limpo · `test` **200/200 em 46 arquivos** · `build` passa ·
`vitest run --sequence.shuffle` passa (sem dependência de ordem).

### A premissa desta task estava vencida

A spec foi escrita quando o frontend tinha "24 testes em 9 arquivos". As tasks 15–25 já
entregaram a maior parte dos itens 1–3 de forma incremental — quando o defeito foi corrigido,
o teste foi junto. O que já existia antes desta task:

| Item da spec | Onde já está |
|---|---|
| Handlers MSW honestos (item 1) | `src/test/msw/auth.ts::requireBearer` + guarda em `handlers.ts` (`/items/categories`, `/locations`) — task 16 |
| Módulo monetário + vetores dourados (item 3) | `src/lib/money.test.ts`, `src/lib/craft-formulas.golden.test.ts` — task 18 |
| Projeção "e se" comparada ao backend (item 3) | `src/lib/ranking-projection.golden.test.ts` — task 23 |
| Sincronia de filtros com a URL, ida e volta (item 3) | `src/opportunities/useOpportunityParams.test.tsx` — task 20 |
| Paginação: 1ª página, última, além do fim, vazio (item 3) | `src/components/opportunities/Pagination.test.tsx` — task 20 |
| Hooks: dedup, cache, cancelamento no desmonte, polling só com aba visível (item 3) | `src/test/tanstack-query-behavior.test.tsx` — task 15; `src/lib/usePageVisible.test.tsx` — task 21 |
| 429, abort, onda de 401 (item 3) | `src/api/client.test.ts` — tasks 15–16 |
| Sessão expirada no meio da navegação (item 3) | `src/auth/auth.test.tsx` ("restaura sessão da aba e mostra expiração após 401") — task 16 |
| `axe` sem violação séria em todas as rotas | `src/test/a11y.test.tsx` — task 25 |

### O que esta task fez

- **Isolamento por caso (item 2):** `src/api/query.ts` passou a exportar `createQueryClient()`
  (políticas de produção: retry só em erro retryável, mutação sem retry). `src/test/render.tsx`
  cria **um cliente por render** em vez de reusar o singleton da aplicação — cache de um caso
  não vaza pro próximo nem dentro do mesmo arquivo. O `queryClient.clear()` do `setup.ts` fica
  só pros poucos testes que ainda tocam o singleton direto (`DetailDrawer.test.tsx`).
- **Meta de cobertura medida e travada (item 4):** `@vitest/coverage-v8` instalado; bloco
  `coverage` no `vite.config.ts` com `include` só nos módulos de lógica (`src/lib/**`,
  `src/api/**`, `**/hooks.ts`, `**/service.ts`, `useOpportunityParams.ts`) — `query.ts`/`index.ts`
  fora (fiação). Baseline medido: **96,05 % stmts / 89,75 % branches / 97,58 % funcs /
  98,03 % lines**. Threshold fixado abaixo disso como trava (ratchet): **92 / 84 / 93 / 93**.
  `npm run test:coverage` roda o gate; o CI também.
- **CI do frontend (item 5):** `.github/workflows/frontend-ci.yml` — `npm ci` → `lint` →
  `typecheck` → `test:coverage` (com o gate) → `build`, disparado por `paths: frontend/**`.
  Não havia workflow de frontend nenhum antes.
- **Buracos reais de lógica que a medição revelou** (cada teste verificado contra o defeito
  antes de ficar verde):
  - `src/api/errors.test.ts` (novo): `retryable` por status, `normalizeDetail` (array só com
    objetos), `errorFromResponse` (detail string vs corpo não-JSON), `normalizeRequestError`
    (`DOMException` AbortError, `Error` AbortError, fallback de rede). Antes só de raspão pelo
    `client.test.ts`.
  - `src/lib/craft-formulas.guards.test.ts` (novo): cada `RangeError` do contrato de
    `docs/11-formulas-de-craft.md` — os vetores dourados só cobriam os caminhos felizes.
  - `src/lib/ranking-projection.applyProjection.test.ts` (novo): `applyProjection` — a costura
    que `production-pages.tsx` usa de verdade (mapeamento camelCase→snake_case,
    `buy_price`/`sell_price` por unidade produzida, passthrough do flip). O golden só trava
    `projectRankingRow`.
  - `src/lib/money.test.ts` (+1 caso): os três formatadores de exibição degradam pra `—` com
    string não-numérica ou valor não-finito, nunca lançam dentro de uma célula.

### Desvios da spec

- A spec pedia "cada teste novo verificado vermelho antes de verde". Os testes novos desta task
  cobrem **guardas e costuras não exercitadas**, não defeitos abertos — foram verificados
  injetando uma regressão (ex.: `buy_price` a partir do bruto em vez do custo) e confirmando a
  falha, depois revertendo. Não há bug de produção corrigido aqui; a task 25 e anteriores já
  tinham fechado os que existiam.
- Threshold de cobertura é **agregado** nos módulos de lógica, não por-arquivo. `tokens/` fica
  em ~82 % (wrapper fino de API), abaixo do teto agregado mas sem peso pra derrubá-lo — um teto
  por-glob aqui seria número perseguido, não sinal.
