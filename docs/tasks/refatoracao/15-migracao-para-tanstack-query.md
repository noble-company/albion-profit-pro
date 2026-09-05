# 15 — Migração para TanStack Query

> Corrige `F04`. Habilita as tasks 17, 19 e 23.

## Objetivo

Usar a biblioteca de dados que já está instalada e configurada, eliminando ~230 linhas de
infraestrutura de fetch escrita à mão — e, com ela, o piscar da interface.

## Por que

`src/api/query.ts` define `queryPolicies` com `staleTime` por domínio (`catalog`, `market`,
`demand`, `craft`) e um `QueryClient` com política de retry ligada a `isRetryableApiError`.
**Nada no produto usa `queryPolicies`.** O único consumidor de `useQuery` é
`src/tokens/hooks.ts`.

Todo o resto — oportunidades, preços, itens, craft, localizações, categorias — é
`useState` + `useEffect` + `AbortController` + `setInterval` escritos à mão. As consequências são
visíveis na tela:

- **Sem cache:** sair de uma tela e voltar refaz tudo, com flash de "Carregando".
- **Sem dedup:** `getLocations()` é buscado em três lugares independentes (calculadora, preços,
  rankings); `getCategories()` idem.
- **Polling burro:** `setInterval(30s)` continua rodando com a aba em segundo plano e com o
  drawer de detalhe aberto.
- **`setData(null)` a cada mudança de filtro:** a tabela pisca em branco a cada tecla digitada em
  "Lucro mínimo" — e o próprio código traz `eslint-disable` para permitir isso.
- **Cancelamento que não cancela:** `useItemPrices` cria `new AbortController().signal` inline e
  descarta a instância; nenhuma requisição é realmente abortada.

## O que implementar

1. Converter todos os acessos a dados para `useQuery`/`useMutation`, com chaves estruturadas
   (`['opportunities', kind, realm, params]`) e `queryPolicies` efetivamente aplicadas.
2. Usar `placeholderData` (`keepPreviousData`) no lugar de `setData(null)`: ao mudar filtro, a
   tabela anterior permanece esmaecida até a nova chegar. Fim do piscar.
3. Passar o `signal` que o TanStack Query fornece para o `openapi-fetch`, substituindo os
   `AbortController` manuais.
4. Polling via `refetchInterval` com `refetchIntervalInBackground: false`, para a aba oculta
   parar de consultar. Suspender o polling enquanto um diálogo de detalhe estiver aberto.
5. Apagar `useFlipOpportunities`, `useProductionOpportunities`, `useItemPrices` e `useBuscaItens`
   na forma atual, junto dos `eslint-disable` que existiam só para sustentá-los.
6. Corrigir `useBuscaItens`: o objeto `filters` no array de dependências reinicia o debounce a
   cada render do pai. A chave de query resolve isso naturalmente.
7. Erros passam a limpar no sucesso seguinte — hoje `.catch(setError)` nunca é revertido.

## Depende de

Task 01. Independente do bloco visual; pode avançar em paralelo às tasks 11-14.

## Testes automatizados

- Duas telas que pedem `/locations` disparam **uma** requisição (dedup verificado por MSW).
- Mudar filtro mantém as linhas anteriores visíveis até a resposta chegar.
- Com `document.visibilityState = 'hidden'`, nenhum refetch periódico acontece.
- Desmontar o componente aborta a requisição em andamento — teste que hoje falharia.
- Um erro seguido de sucesso limpa o estado de erro.
- Nenhum `setInterval` ou `AbortController` manual permanece em `src/` fora de `api/`.

## Testes manuais

Navegar entre telas e voltar, confirmando que não há flash de carregamento; deixar a aba em
segundo plano por alguns minutos e conferir na aba de rede que as requisições pararam.

---

## Estado da implementação

**Concluída.** `npm run typecheck` limpo · `npm run lint` 0 erros (**4** warnings
pré-existentes — eram 6 antes desta task; dois somem porque as próprias causas, um
`useEffect` com dependência complexa, deixaram de existir) · `npm run test` 86/86 em 17
arquivos · `npm run build` passa. Migração líquida: **−101 linhas** nos 10 arquivos de
domínio tocados (327 removidas, 226 adicionadas).

### O que entrou

- **`opportunities/hooks.ts`** — `useFlipOpportunities`/`useProductionOpportunities`
  reescritos como `useQuery` (`placeholderData: keepPreviousData`, `refetchInterval: 30_000`,
  `refetchIntervalInBackground: false`, política `market`). `useProductionOpportunities` ganha
  `options.pausePolling` — `production-pages.tsx` passa `true` enquanto o drawer de detalhe
  está aberto. Nova `useCategories()` (política `catalog`).
- **`prices/hooks.ts`** — `useItemPrices` idem. Nova **`useLocations()`** (política
  `catalog`) — é o que faz `/locations` deduplicar entre `craft/pages.tsx`,
  `opportunities/production-pages.tsx` e `prices/pages.tsx`, que antes buscavam cada um a
  sua cópia.
- **`prices/demand.tsx`** — `useDemand` reescrito como `useQuery` (política `demand`, que
  já existia em `query.ts` sem nenhum consumidor). Corrige de graça o bug do item 7: o
  `.catch(setError)` original nunca revertia o erro num sucesso seguinte.
- **`prices/service.ts`** — nova `getDemand()`, extraída do `apiClient.GET` que vivia inline
  dentro do hook em `demand.tsx` (regulariza o padrão do resto do domínio: `service.ts` só
  tem função pura + `signal`, hook consome via `queryFn`).
- **`items/hooks.ts`** — `useBuscaItens` reescrito com `useQuery` + **`src/lib/useDebouncedValue.ts`**
  (novo, genérico). Corrige o item 6 na raiz: o debounce agora depende só do texto
  normalizado, não do objeto `filters` recriado a cada render do pai.
- **`craft/pages.tsx`** — `getLocations` vira `useLocations()`; `simulateCraft` vira
  `useMutation` (calculadora).
- **`opportunities/production-pages.tsx`** — `getLocations` vira `useLocations()` (filtrado
  a `kind==='city'` com `useMemo`); `simulateCraft` do drawer "Analisar" vira `useMutation`.
  `useMutation` zera `data`/`error` ao entrar em `pending`, então a linha anterior nunca
  aparece durante o carregamento da nova (não precisei de um reset manual).
- **`opportunities/pages.tsx`** — `getCategories` vira `useCategories()`.
- **`test/setup.ts`** — `queryClient.clear()` no `afterEach`. Achado que não estava na spec:
  `test/render.tsx` importa o `queryClient` **singleton de produção**; sem limpar o cache
  entre testes, um teste que aquece `/locations` vazaria pro próximo teste do mesmo arquivo
  agora que a lib realmente cacheia alguma coisa.

### Testes novos

- **`test/tanstack-query-behavior.test.tsx`** — os 5 primeiros bullets desta task, um teste
  por bullet, usando `renderHook` + um `QueryClient` isolado por teste (`retry:false`, não o
  singleton de produção): dedup de `/locations`, `keepPreviousData` ao trocar filtro, sem
  refetch com `document.visibilityState='hidden'` (com fake timers), abort real no unmount
  (verificado via `request.signal.aborted` dentro do handler MSW), erro que limpa no sucesso
  seguinte.
- **`test/no-manual-fetch-infra.test.ts`** — guarda automatizada pro último bullet: nenhum
  `setInterval`/`new AbortController()` manual em `src/` fora de arquivos de teste (que
  legitimamente constroem um `AbortSignal` pra chamar uma função de `service.ts` direto).
- **`test/queryTestClient.tsx`** — helper (`QueryClient` + `wrapper` isolados) usado pelos
  testes de comportamento acima.

### Desvios da spec

- **`queryPolicies.craft` continua sem consumidor.** Não existe nenhum `GET` em `craft/` —
  só o `POST /craft/simulate`, que virou `useMutation` (mutações não usam `staleTime`). A
  policy fica pronta pra um futuro endpoint de leitura; não force um uso artificial.
- **Teste de abort precisou de uma sincronização explícita.** A primeira versão do teste
  desmontava o componente imediatamente após `renderHook()`, antes do fetch sequer sair —
  o TanStack Query só aborta uma requisição que já está em voo. Corrigido esperando a
  requisição chegar no handler MSW (`resolveStarted()`) antes de desmontar.

### Testes automatizados (rodados de verdade)

- `npm run typecheck` — limpo.
- `npm run lint` — 0 erros, 4 warnings pré-existentes.
- `npm run test` — **86/86 em 17 arquivos**, incluindo os 80 pré-existentes (nenhuma
  regressão: `production-pages.test.tsx`, que exercita o fluxo do drawer "Analisar" ponta a
  ponta via `useMutation`, continua verde sem alteração no próprio teste).
- `npm run build` — passa.

### Testes manuais que já rodei

Nenhum — os dois itens da seção "Testes manuais" exigem navegar entre telas logado e
observar a aba de rede do navegador, algo que só um humano faz. Os 5 comportamentos que dão
sustentação a esse teste manual (dedup, sem flash, pausa em segundo plano, abort, limpeza de
erro) já estão cobertos por teste automatizado de verdade, não por inspeção de código.

### Pendente pra você testar

1. `npm run dev`, entrar, navegar entre Market Flip → Refino → Craft → Preços → voltar —
   confirmar que não há flash de "Carregando" ao voltar pra uma tela já visitada (cache).
2. Abrir a aba de Rede do navegador, deixar a aba do produto em segundo plano por mais de
   30s numa tela com polling (Market Flip, Refino ou Craft) e confirmar que as requisições
   periódicas param; voltar o foco pra aba e confirmar que retomam.
3. No ranking de Refino/Craft, abrir o drawer "Analisar" numa linha e conferir que o
   polling da tabela de fundo pausa enquanto o drawer está aberto (nenhuma requisição nova
   de `/opportunities/*` na aba de Rede até fechar o drawer).
