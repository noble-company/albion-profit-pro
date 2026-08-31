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
