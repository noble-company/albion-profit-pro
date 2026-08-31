# 03 — Ranking de produção materializado

> Corrige `B02`. Habilita a task 23 (camada "e se" no cliente).

## Objetivo

Fazer o ranking de refino e craft cobrir **todas** as receitas e responder por leitura indexada,
em vez de simular milhares de cenários dentro do request.

## Por que

`recipe_opportunities` seleciona candidatos com `.limit(200)` ordenado por
`Recipe.output_item_unique_name` — **ordem alfabética** — sobre 5.633 receitas semeadas. O que a
tela chama de "o que vale a pena refinar" é, na verdade, *o melhor entre as 200 primeiras
receitas do alfabeto*. Nada avisa o usuário. Para um produto cuja proposta é achar a melhor
oportunidade, isso é falha de correção, não de performance.

Somado a isso, o laço é `candidatos × cidades × qualidades` chamando `simulate_craft` de forma
sequencial, cada chamada com suas próprias queries: até 200 × 8 × 5 = 8.000 simulações por
request. O cache Redis de 30 s não salva, porque a chave inclui todos os filtros (taxa de
retorno, custo de estação, foco), então a taxa de acerto real é baixíssima.

## O que implementar

1. Criar tabela materializada de ranking — uma linha por (realm, receita, cidade, qualidade),
   guardando os **componentes** do resultado, não só o número final:
   custo de ingrediente por modo de aquisição, preço de saída por modo de venda, custo de prata
   da receita, foco por execução, quantidades produzidas e o `oldest_observed_at` de cada lado.
2. Calcular em **parâmetros neutros** (`return_rate=0`, `station_cost=0`, sem imposto aplicado),
   de modo que premium, retorno, estação e taxas possam ser aplicados depois — no cliente
   (task 23) ou numa projeção barata no servidor.
3. Job Celery na fila `maintenance` que recalcula o ranking; disparo por agenda e/ou por
   invalidação após ingest. Definir e documentar a janela de atualização aceitável.
4. Remover o `.limit(200)`. A cobertura passa a ser total e verificável.
5. Trocar a leitura de `/opportunities/refining` e `/crafting` por `SELECT ... WHERE ...
   ORDER BY ... LIMIT/OFFSET` sobre a tabela, com índices para os filtros usados na UI (realm,
   tier, encantamento, qualidade, cidade, lucro, ROI, frescor).
6. Manter `POST /craft/simulate` como está para o detalhe de um item: continua sendo a
   simulação exata com profundidade de livro, sob demanda.
7. Expor no payload a **cobertura do ranking** (quantas receitas foram avaliadas, quando o
   ranking foi calculado) para que a UI nunca mais esconda truncamento.

## Depende de

Tasks 01 e 05. Deve ficar pronta antes das tasks 17, 22 e 23.

## Testes automatizados

- O ranking contém receitas fora das 200 primeiras em ordem alfabética (teste que falharia hoje).
- Contagem de receitas avaliadas é igual ao total de receitas elegíveis do realm.
- O número de queries de `/opportunities/refining` é **constante** e não cresce com o dataset.
- Resultado do ranking materializado bate com `simulate_craft` para uma amostra de linhas, nos
  mesmos parâmetros neutros.
- Reexecução do job é idempotente: rodar duas vezes não muda o conteúdo.
- Ranking desatualizado é sinalizado no payload, não silenciosamente servido como atual.

## Testes manuais

Rodar o job num dump real e conferir que um refino conhecidamente lucrativo com nome no fim do
alfabeto (que hoje nunca aparece) passa a figurar no ranking.

## Estado da implementação

Concluída em 2026-08-31.

### Tabelas (`src/opportunities/models.py`, migração `d5f8a9b0c1e2`)

- **`recipe_ranking`** — 1 linha por `(server_id, output_item, location_id, output_quality)`.
  Guarda os componentes **neutros** (`return_rate=0`, `station=0`, sem imposto nem setup fee):
  `ingredient_cost_immediate` / `_order`, `output_gross_immediate` / `_order`, `recipe_silver_cost`
  e `executions` (produção para qty=1), `ingredients` (JSONB, lista neutra para a UI),
  `*_observed_at` por lado, `warnings` (JSONB). `neutral_profit` / `neutral_roi` (imediato/imediato)
  são materializados e indexados — base de ordenação e dos filtros `min_profit` / `min_roi`.
  Índices: `(server_id, is_refining, neutral_profit)`, `(… tier, enchantment_level, output_quality)`,
  `(… location_id)`.
- **`recipe_ranking_run`** — 1 linha por realm: `evaluated_recipes`, `priced_recipes`,
  `total_recipes`, `ranking_rows`, `computed_at`, `duration_ms`. Alimenta `coverage`.

### Job (`src/opportunities/tasks.py`, `ranking_service.rebuild_ranking`)

- `opportunities.rebuild_recipe_ranking`, fila `maintenance`, beat a cada **10 min**
  (`crontab(minute="*/10")`), `soft_time_limit=540s`.
- "Elegível" = receita cujo **output foi observado** no mercado do realm numa cidade curada
  (`latest_order_observation_filter()`). Para cada elegível × qualidade observada, chama
  `simulate_craft` com parâmetros neutros e o mesmo núcleo de cálculo (task 05), extrai os
  componentes das 4 cenas. `evaluated_recipes == receitas elegíveis` por construção.
- Sem `.limit(200)`. Transação única com `pg_advisory_xact_lock` por realm; `DELETE` + `INSERT`
  em lote; upsert de `recipe_ranking_run`. **Idempotente** (rodar 2× → mesmo conteúdo).

### Leitura (`ranking_service.read_recipe_ranking`)

- `/opportunities/refining` e `/crafting` → `recipe_opportunities` delega. **Count + SELECT
  paginado** sobre `recipe_ranking` (`ORDER BY neutral_profit DESC NULLS LAST`, `LIMIT/OFFSET`),
  join com `item` só na página. Filtros `tier`/`enchantment`/`quality`/`location`/`min_profit`/
  `min_roi`/`require_complete` no SQL; `item_id` (busca) também.
- **Projeção barata na página** (`_project_row`): aplica premium/imposto + setup fees; `return_rate`
  escala o custo de ingrediente **linearmente** (aproximação — recompute exato é
  `POST /craft/simulate` / task 23); `station_cost` × execuções. Escolhe o melhor de aquisição ×
  venda. `OpportunityOut.price_model = "neutral_ranking"`.
- `OpportunityPage.coverage` (`RankingCoverage`): `evaluated_recipes`, `priced_recipes`,
  `total_recipes`, `computed_at`, `stale` (`> 15 min` desde `computed_at`, ou nunca calculado).
- `POST /craft/simulate` **intacto**.

### Mudanças de comportamento / contrato

- **`max_age_hours` só aperta** a janela de frescor da própria reconstrução (política de 6h). Uma
  ordem mais velha que 6h não é precificada no rebuild; pedir 24h na leitura não a recupera. O
  ranking é "o que é acionável agora".
- `/refining` e `/crafting` ganharam `item_id` (busca) e o campo `coverage`. `profit`/`roi` das
  linhas passam a ser **projeção sobre o neutro**, não o "melhor de 4 cenários" recalculado no
  request. `ingredients` traz a lista neutra (return_rate=0).
- Frontend: `schema.d.ts` regenerado; `production-pages.tsx` mostra uma linha de cobertura
  (`priced/evaluated/total`, idade do cálculo, aviso de desatualizado).

### Medição

| | Antes (`B02`) | Depois (medido) |
|---|---|---|
| Cobertura | 200 primeiras receitas em ordem alfabética, sem aviso | **todas** as elegíveis; `coverage` no payload |
| Trabalho no request | até ~8.000 `simulate_craft` sequenciais | **2 queries** (count + página), constante — teste `test_read_query_count_is_constant_regardless_of_ranking_size` |
| `EXPLAIN (ANALYZE)` da página, 400 linhas de ranking | — | `Execution Time: ~0,6 ms`, top-N heapsort, `Buffers: shared hit=27` |
| Reconstrução | — | ~6,5 ms por combinação (`simulate_craft`); ~2,6 s / 400 linhas no teste. Real (~2–4k combinações/realm) fica bem abaixo do `soft_time_limit` de 540 s |

### Testes

- `uv run pytest tests/ -q` → **314 passed**. `uv run ruff check .` → limpo.
- `tests/opportunities/test_recipe_ranking.py` (7): cobre além das 200 alfabéticas · `evaluated ==
  elegíveis` · nº de queries constante · linha materializada bate com `simulate_craft` neutro ·
  rebuild idempotente · ranking velho sinalizado (não escondido) · `recipe_ranking_run` upsert por
  realm.
- `tests/opportunities/test_flips.py` — `test_refining_ranking_reads_materialized_table_with_projection`
  reescrito: leitura da tabela, filtro de qualidade, projeção de premium/return/station, aperto
  de frescor.
- Frontend `npm run lint && npm run typecheck && npm run test` → 0 erros, 24 verdes.

### Fora de escopo (segue como está)

- `is_refining` ainda por substring de categoria (`resource`/`refin`/`material`) — `B11`/task 09.
- Invalidação pós-ingest não implementada — só beat (10 min) + trigger manual. A janela de 15 min
  é a obsolescência aceitável documentada.
