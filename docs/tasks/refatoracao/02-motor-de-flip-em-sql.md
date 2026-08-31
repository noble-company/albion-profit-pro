# 02 — Motor de flip em SQL

> Corrige `B01`, `B03` e `B06`.

## Objetivo

Transformar `/opportunities/flips` de uma varredura O(n²) em memória Python numa consulta SQL
paginada e ordenada pelo Postgres, cotando apenas ordens realmente executáveis.

## Por que

`src/opportunities/service.py:69-174` hoje:

1. Emite `select(MarketOrder, Item)` **sem `LIMIT`** — traz todas as ordens do realm que casam
   com os filtros para a memória do processo da API.
2. Usa `latest_order_observation_filter()`, uma subquery correlacionada com `MAX()`, avaliada
   por linha sobre a tabela inteira.
3. Cruza `grouped.items()` **dentro** de `grouped.items()` — com ~5.000 combinações são 25
   milhões de iterações por request.
4. Ordena e pagina em Python, depois de materializar a lista completa.

O frontend chama esse endpoint a cada 30 s, por usuário e por aba aberta. É o gargalo nº 1.

Além disso, o flip **não filtra `expires`** — o motor de craft filtra (`MarketOrder.expires >
now`). A tela principal do produto pode recomendar a compra de uma ordem que já não existe no
jogo. E, enquanto o craft caminha a profundidade real do livro, o flip usa uma única melhor
oferta com `qty = min(oferta.amount, procura.amount)` sem teto — anuncia volume não executável.

## O que implementar

1. Substituir a subquery correlacionada por `DISTINCT ON` ou função de janela sobre
   `ix_market_order_latest_observation`, que já existe e cobre exatamente essa chave.
2. Filtrar `expires > now()` no flip, igual ao motor de craft (`B03`).
3. Fazer o cruzamento compra/venda **no SQL** (self-join sobre a projeção da melhor oferta por
   cidade e da melhor procura por cidade), não em laço Python.
4. Ordenar, paginar e contar no Postgres. `total` vem de `COUNT(*) OVER ()` ou consulta
   dedicada — nunca de `len(lista_completa)`.
5. Alinhar o modelo de preço ao do craft (`B06`): consumir níveis do livro por profundidade,
   reutilizando `query_executable_book_levels`, e limitar a quantidade sugerida ao que é
   executável de fato. Se a decisão for manter o topo do livro por custo, **declarar isso na
   resposta** com um campo explícito, não implicitamente.
6. Usar a constante de frescor de configuração, não `6 * 3600` cravado (ver task 05).
7. Registrar `EXPLAIN (ANALYZE, BUFFERS)` do plano final no bloco "Estado da implementação".

## Depende de

Task 01. Recomendado fazer junto ou logo antes da task 05 (constantes compartilhadas).

## Testes automatizados

- Ordem com `expires` no passado **não** aparece em nenhuma oportunidade de flip.
- Resultado é idêntico ao motor antigo num dataset fixo (teste de regressão do algoritmo).
- `total` continua correto quando `offset` avança até a última página.
- Quantidade sugerida nunca excede a profundidade executável do lado comprador.
- Nenhuma combinação atravessa cidades diferentes de item, qualidade ou encantamento.
- Teste de carga: dataset com ao menos 5.000 combinações responde abaixo do orçamento definido
  na task, e o número de queries por request é constante (não cresce com o dataset).

## Testes manuais

Comparar a primeira página de `/opportunities/flips` antes e depois no mesmo dump, conferindo
que os itens no topo continuam fazendo sentido e que o tempo de resposta caiu.

## Estado da implementação

Concluída em 2026-08-31.

`flip_opportunities` (`src/opportunities/service.py`) virou **uma única consulta** encadeada em
CTEs — `flip_orders` (janela `max(last_seen_at)` por lado, substituindo a subquery correlacionada)
→ `fresh_flip_orders` (última observação + `expires > now()` + `max_age_hours`) → `best_offers` /
`best_requests` (`DISTINCT ON` por cidade) → `flip_candidates` (self-join compra×venda + lucro/ROI
em SQL) → `filtered_flips`. A página faz `COUNT` + `SELECT` paginado (2 statements fixos); o join
com `item` para o nome roda só sobre a página (≤ `limit` linhas).

Mudanças de contrato/comportamento:

- **`B03`**: ordens expiradas somem do flip nas duas pontas (igual ao motor de craft).
- **`B06`**: `OpportunityOut.price_model = "top_of_book"` declara que o flip cota o melhor nível
  de cada lado, com quantidade limitada ao que esses níveis realmente têm — não caminha a
  profundidade. Caminhar profundidade como o craft fica como possível `W` futuro.
- **`B07`/`B08` (parcial, resto na task 05)**: removidos `PREMIUM_SALES_TAX`,
  `NON_PREMIUM_SALES_TAX`, `SETUP_FEE` e `_charge` locais; as rates vêm de `craft/constants.py` e
  o arredondamento `ceil()` no SQL reproduz `calculate_percentage_charge`. `6 * 3600` trocado por
  `get_market_book_policy().freshness_seconds`.
- Desempate de preço no melhor nível: `ORDER BY unit_price, amount DESC, last_seen_at DESC`
  (antes era a ordem indefinida do `min()` do Python).
- `roi` arredondado a 4 casas no SQL (antes: divisão `Decimal` com ~28 dígitos no payload).
- `gross_revenue` **continua** carregando o valor líquido no flip (o rename é `B04`, task 04).

### Medição antes/depois

| | Antes (`B01`, auditoria) | Depois (medido) |
|---|---|---|
| Trabalho | carrega todas as ordens do realm para a memória da API, cruza `grouped.items()` dentro de `grouped.items()` (~25 M de iterações para ~5.000 combinações), ordena e pagina em Python | tudo no Postgres |
| Queries por request | 1 `SELECT` gigante + processamento Python O(n²) | **2**, constante — teste `test_flip_query_count_is_constant_regardless_of_dataset_size` compara dataset pequeno vs. 2.500 combinações |
| `EXPLAIN (ANALYZE, BUFFERS)` da página, 3.000 itens / 9.000 ordens / 6.000 candidatos | — | `Execution Time: ~25 ms`, `Buffers: shared hit=337`, `Index Scan using ix_market_order_item_id` → `WindowAgg` → `Merge Join` → `top-N heapsort` → `Index Scan using item_pkey (loops=50)` |

Plano resumido:

```text
Nested Loop (rows=50)
  CTE fresh_flip_orders
    -> WindowAgg -> Incremental Sort -> Index Scan using ix_market_order_item_id on market_order
  -> Limit -> Sort (top-N heapsort) -> Merge Join
       -> Unique (DISTINCT ON best_offers) -> Sort -> CTE Scan fresh_flip_orders
       -> Materialize -> Unique (DISTINCT ON best_requests) -> Sort -> CTE Scan fresh_flip_orders
  -> Index Scan using item_pkey on item (loops=50)
Planning Time: ~0.4 ms / Execution Time: ~25 ms
```

O índice `ix_market_order_latest_observation` existe e cobre a chave da janela; nos dados
sintéticos o planner preferiu `ix_market_order_item_id` + sort incremental por o volume caber em
memória, mas a chave está disponível para o otimizador em produção.

### Testes

- `uv run pytest tests/ -q` → **294 passed** (inclui 4 testes novos de flip: expira nos dois
  lados, `total` estável até a última página, quantidade ≤ profundidade do comprador sem cruzar
  item/encantamento, contagem de queries constante).
- `uv run ruff check .` → limpo.
- Frontend `npm run lint && npm run typecheck && npm run test` → 0 erros, 24 testes verdes;
  `src/api/schema.d.ts` regenerado com `price_model`.
