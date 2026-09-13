# 11 — Retry real e erro que não some

> Corrige `E11`.

## Objetivo

Dar às telas uma saída que não seja F5 quando a requisição falha, e parar de esconder falha de
requisição auxiliar.

## Por que

**Três das seis telas não conseguem oferecer retry.** Os hooks devolvem só
`{ data, loading, error }` e não expõem `refetch`:

- `frontend/src/opportunities/hooks.ts:44` — `useFlipOpportunities` (Market Flip)
- `frontend/src/opportunities/hooks.ts:65` — `useProductionOpportunities` (Refino e Craft)
- `frontend/src/prices/hooks.ts` — `useItemPrices` (Preços)

Calculadora e Tokens têm retry (`craft/pages.tsx:184-186`, `tokens/pages.tsx:116`); as outras
três não. O guard `src/test/no-inert-onretry.test.ts:13` proíbe corretamente botão de retry que
não faz nada — o resultado é que a tela simplesmente não oferece botão. O teste passa; o usuário
fica sem saída. É um caso em que o guard está certo e o desenho está errado.

**Erro de requisição auxiliar é engolido.** Três hooks devolvem valor vazio no lugar do erro:

- `src/opportunities/hooks.ts:25` — `useCategories`: `return data ?? []`
- `src/prices/hooks.ts:29` — `useLocations`: `return data ?? []`
- `src/prices/hooks.ts:16` — `useItem`: `return data ?? null`

Falha em `/items/categories` renderiza um filtro de categoria só com "Todas", sem nenhum aviso.
Falha em `/locations` esvazia o filtro de cidade em quatro telas. Falha em `/items/{id}` faz o
título cair para o `unique_name` cru, indistinguível de "item sem nome".

**Uma tela não trata nada.** `src/items/pages.tsx` não usa `Carregando`, `EstadoErro` nem
`EstadoVazio` — o vocabulário que `docs/13-linguagem-visual.md` definiu e que as outras cinco
telas usam.

**Cancelamento é tratado como falha.** `src/api/errors.ts:25-27` marca requisição abortada como
`retryable: true`, e `safeApiCall` (`src/api/client.ts:25-30`) converte o `AbortError` nativo num
`ApiError` comum. O TanStack Query perde a capacidade de reconhecer o cancelamento, então cada
tecla no `ItemAutocomplete` que aborta a busca anterior tende a virar retry (`api/query.ts:22-23`)
em vez de cancelamento limpo — mais requisição e estado de erro passageiro onde deveria haver
silêncio.

## O que implementar

1. Expor `refetch` nos três hooks e ligar o `onRetry` de `EstadoErro` nas telas de Market Flip,
   Refino/Craft e Preços. Os hooks já usam TanStack Query, então `refetch` é o que a lib entrega —
   é só parar de descartá-lo.
2. Parar de engolir erro em `useCategories`, `useLocations` e `useItem`: propagar o estado de
   erro e deixar a tela decidir entre degradar com aviso visível ou mostrar `EstadoErro`.
   Degradação silenciosa não é opção — a linguagem visual do produto trata "ausência de dado" como
   informação, não como zero.
3. Dar a `src/items/pages.tsx` os quatro estados (carregando, erro com retry, vazio, conteúdo).
4. Corrigir a classificação de aborto em `src/api/errors.ts:25-27`: requisição cancelada não é
   retryable e não deve virar estado de erro visível.
5. Revisar `src/api/query.ts` para confirmar que a política de retry não reage a cancelamento nem
   a erro 4xx de cliente.

## Depende de

Task 03 — o `ErrorBoundary` cobre o erro de render; esta cobre o erro de requisição. As duas
juntas fecham o assunto.

## Testes automatizados

- Com a API fora do ar, cada uma das três telas mostra `EstadoErro` **com** botão de tentar de
  novo, e o clique dispara nova requisição (contador de requests do MSW).
- Falha em `/items/categories` produz aviso visível, não filtro vazio silencioso.
- `src/items/pages.tsx` cobre os quatro estados.
- Digitar rápido no autocomplete não gera retry: o número de requisições bate com o número de
  buscas, não com o dobro.

## Testes manuais

Derrubar a API com a tela de Refino aberta, clicar em "Tentar de novo", subir a API e confirmar
que a tabela volta sem recarregar a página.
