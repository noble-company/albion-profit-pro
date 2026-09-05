# 17 — Ordenação e paginação no servidor

> Corrige `F08`.

## Objetivo

Fazer o ranking exibido ser realmente o ranking pedido, e os contadores de paginação dizerem a
verdade.

## Por que

O servidor pagina (`limit=25`) e ordena por lucro. O cliente então **re-ordena as 25 linhas que
recebeu**, em `opportunities/pages.tsx` e `production-pages.tsx`:

```ts
sorted.sort((a, b) => { const difference = value(a) - value(b); ... })
```

Escolher "ROI (maior → menor)" ordena o ROI **dentro da página 1 do ranking de lucro**. Não é o
ranking de ROI — é uma reordenação de uma amostra enviesada. O mesmo vale para "Atualização". O
usuário acredita estar vendo as melhores oportunidades por ROI e está vendo outra coisa.

O mesmo defeito, em outra forma, está em `prices/pages.tsx`: os filtros de Qualidade e
Encantamento são aplicados com `.filter()` **depois** da paginação. O contador "1–20 de 137"
conta o total sem filtro, e a página pode aparecer vazia mesmo havendo resultados adiante.

Há ainda o detalhe de precisão: `value()` usa `Number(row.roi)` — aritmética monetária no
cliente, o que a task 18 elimina.

## O que implementar

1. Enviar o critério de ordenação ao servidor (`sort` = `profit`/`roi`/`freshness`, `direction`)
   e aplicá-lo no SQL, sobre o conjunto completo.
2. Enviar os filtros de qualidade e encantamento da tela de preços ao servidor; `total` passa a
   refletir o conjunto filtrado.
3. Remover toda reordenação e filtragem pós-paginação do cliente.
4. Corrigir os contadores para descreverem o conjunto real ("1–20 de N filtrados").
5. Validar `sort` contra uma lista fechada no backend, sem interpolação de string em SQL.
6. Definir desempate estável (por exemplo lucro, depois `item`, depois `location`) para que a
   paginação não repita nem pule linha entre páginas.

**Nota de escopo:** o "e se" do cliente (task 23) reordena localmente **por desenho**, quando os
parâmetros mudam sem novo fetch. A diferença é que ali o conjunto em memória é o universo
relevante e isso é explícito; aqui é uma amostra paginada tratada como se fosse o todo.

## Depende de

Tasks 02, 03 e 15.

## Testes automatizados

- Ordenar por ROI e paginar produz sequência globalmente decrescente entre páginas — teste que
  hoje falharia.
- Filtrar qualidade na tela de preços muda o `total`.
- `sort` inválido é rejeitado com 422 e não chega ao SQL.
- Percorrer todas as páginas não repete nem omite linha (desempate estável).
- Nenhum `.sort()` ou `.filter()` sobre resultado paginado permanece nos componentes.

## Testes manuais

Ordenar por ROI, anotar as 25 primeiras linhas e conferir na página 2 que os valores continuam
descendo, sem repetição.

---

## Estado da implementação

**Concluída.** Backend: `uv run pytest tests/ -q` → **338 passed** (334 antes; +4 líquidos) ·
`uv run ruff check .` limpo. Frontend: `npm run typecheck` limpo · `npm run lint` 0 erros
(4 warnings pré-existentes) · `npm run test` **88/88 em 18 arquivos** · `npm run build` passa.

### Backend

- **`src/opportunities/sorting.py`** (novo) — `apply_order(column_map, tiebreakers, sort,
  direction)`: monta o `ORDER BY` a partir de um dict de colunas SQLAlchemy indexado pelo
  valor **já validado** (nenhuma string entra no SQL), com desempate estável. Módulo neutro
  pra `service.py` e `ranking_service.py` (evita import circular).
- **`src/opportunities/router.py`** — `flips`/`refining`/`crafting` ganham
  `sort: Literal["profit","roi","freshness"] = "profit"` e
  `direction: Literal["asc","desc"] = "desc"`. O `Literal` faz o 422 pra valor inválido antes
  de chegar no serviço. Entram na chave de cache.
- **`src/opportunities/service.py`** — `flip_opportunities` recebe `sort`/`direction`; o
  `ORDER BY` (aplicado igual na subquery de página e no select externo) usa `apply_order` com
  desempate `item_id, buy_location, sell_location, quality_level`.
- **`src/opportunities/ranking_service.py`** — `read_recipe_ranking` idem, chave `freshness`
  = `least(ingredients_oldest_observed_at, output_immediate_observed_at)`, desempate
  `output_item_unique_name, location_id, output_quality`.
- **`src/prices/router.py` / `service.py`** — `/items/{id}/prices` ganha `quality_level`/
  `enchantment_level`; `query_item_combinations` filtra o CTE **antes** de contar/paginar, então
  `total` reflete o conjunto filtrado.
- `frontend/src/api/schema.d.ts` regenerado (openapiTS + prettier, in-process a partir de
  `app.openapi()` — 8 linhas: os 4 params novos).

### Frontend

- **`opportunities/service.ts`** — `OpportunityQuery` ganha `sort`/`direction`;
  `getFlipOpportunities`/`getProductionOpportunities` os enviam. Novo `parseSortParam()`:
  divide o formato combinado da URL (`profit_desc`) em `{sort, direction}`.
- **`opportunities/pages.tsx` + `production-pages.tsx`** — `query` monta `{sort, direction}`
  via `parseSortParam`; **`rows` vira `result.data?.opportunities ?? []`** — removido o
  `useMemo` com `.sort()` e o `value()` que fazia `Number(row.roi)`. O `<select>` usa o
  `sortParam` combinado (URL compartilhável estável).
- **`prices/service.ts` + `prices/hooks.ts`** — `getItemPrices`/`useItemPrices` ganham
  `{quality, enchantment}` (entram na queryKey).
- **`prices/pages.tsx`** — passa os filtros pro hook; **`rows` vira `data.data?.prices ?? []`**
  (removido o `.filter()`); contador passa a "1–N de \<total\> filtrados" quando há filtro.

### Testes automatizados

Backend (`tests/opportunities/test_flips.py`, `tests/prices/test_router.py`):
- `test_flip_sort_is_global_not_a_reorder_of_the_profit_page` — 6 itens com **lucro crescente e
  ROI decrescente**; percorre 3 páginas com `sort=roi` e afirma sequência globalmente
  decrescente + nenhuma linha repetida/omitida + a 1ª linha por ROI é a última por lucro (é
  outro ranking, não uma reordenação da amostra). Antes desta task o `sort` era ignorado e o
  teste falharia.
- `test_flip_rejects_invalid_sort_before_it_reaches_sql` — 4 valores inválidos (inclusive uma
  tentativa de injeção) → 422; `direction` inválido → 422.
- `test_flip_pagination_is_stable_when_profit_ties` — 6 itens com lucro idêntico, 2 páginas,
  nenhuma repetição/omissão (desempate).
- `test_prices_quality_filter_changes_total_before_pagination` — filtro de qualidade/
  encantamento muda o `total`, respeita a paginação.
- `test_refining_ranking_...` (estendido) — ordena o ranking no servidor + 422 pra sort inválido.

Frontend:
- `test/no-client-paging-mutation.test.ts` (novo, no estilo do `no-manual-fetch-infra`) —
  falha se `.opportunities`/`.prices` forem seguidos de `.sort`/`.filter`, ou se um `.sort()`
  com comparador aparecer nos 3 componentes paginados.
- `opportunities.test.ts` / `prices.test.ts` — passam a afirmar `sort`/`direction` e
  `quality_level`/`enchantment_level` na query.

### Desvios da spec

- O item "aritmética monetária no cliente (`Number(row.roi)`)" foi resolvido só na parte que
  esta task remove (o `value()` do `.sort()`). Os outros `Number()` sobre campos de dinheiro
  (KPI "Lucro na página", fallback de `total_cost`/`gross`) são **`F09`, tratados na task 18**
  — a própria spec diz isso. O guard automatizado desta task não os cobre de propósito.

### Testes manuais que já rodei

Nenhum — o item da seção "Testes manuais" (ordenar por ROI no navegador, anotar 25 linhas,
paginar) exige olhos numa tela logada. O equivalente automatizado (sequência global entre
páginas, sem repetição) já está coberto por teste de backend de verdade.

### Pendente pra você testar

1. `npm run dev` + backend, entrar no Market Flip, ordenar por **"ROI (maior → menor)"**,
   anotar o ROI das últimas linhas da página 1, ir pra página 2 e confirmar que os valores
   **continuam descendo** (antes eles subiam de novo — cada página era reordenada isolada).
2. Na tela de Preços, aplicar um filtro de Qualidade e confirmar que o contador "1–N de M"
   passa a contar **só as combinações daquela qualidade** (antes contava tudo e a página podia
   aparecer vazia).
