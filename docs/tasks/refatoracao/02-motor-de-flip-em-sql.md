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
