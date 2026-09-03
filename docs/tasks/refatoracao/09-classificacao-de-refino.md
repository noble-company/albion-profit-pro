# 09 — Classificação de refino sem heurística de substring

> Corrige `B11`.

## Objetivo

Separar refino de fabricação por um atributo confiável do catálogo, não por busca de texto na
categoria da loja.

## Por que

`_is_refining_item` decide se um item é de refino procurando as substrings `"resource"`,
`"refin"` e `"material"` em `shop_category`/`shop_subcategory`. O espelho SQL
(`_refining_item_filter`) faz seis `ilike '%...%'` combinados com `OR`.

Dois problemas: um item novo com categoria fora desse padrão cai na aba errada — e ninguém
percebe, porque a ausência na lista parece "sem oportunidade"; e `ilike '%...%'` não usa índice,
o que pesa exatamente na consulta que a task 03 quer tornar barata.

## O que implementar

1. Determinar a classificação a partir do dado estático já disponível (`ITEM DUMP.json` /
   `items.json`), no import — não em tempo de consulta. As receitas de refino têm forma
   distinguível na fonte; documentar qual sinal é usado, em
   [02-dados-de-receita.md](../../02-dados-de-receita.md).
2. Persistir a classificação como coluna do catálogo ou da receita (por exemplo
   `production_kind` com valores `refining`/`crafting`), com migration e índice.
3. Atualizar o seed estático e o versionamento do dataset (`StaticDatasetVersion`) para que a
   nova coluna derivada seja recalculada em instalações já semeadas — atenção ao achado `W2`
   da Fase 3, em que só o checksum do manifesto decidia `unchanged`.
4. Substituir `_is_refining_item` e `_refining_item_filter` por um filtro de igualdade.
5. Registrar quantos itens mudam de classificação em relação à heurística atual — é o número
   que prova que a heurística estava errando.

## Depende de

Tasks 01 e 03 (a tabela de ranking já deve existir para receber a coluna nova).

## Testes automatizados

- Um item cuja `shop_category` não contém nenhuma das três substrings, mas que é refino de
  fato, aparece na aba de refino.
- Um item de fabricação com a palavra "material" na subcategoria **não** vaza para o refino.
- Reexecutar o seed sobre uma base já semeada popula a coluna nova (teste de upgrade).
- A consulta de ranking usa índice — confirmado por `EXPLAIN`, sem varredura sequencial.

## Testes manuais

Comparar as duas listas (heurística antiga x classificação nova) e revisar as diferenças item a
item com o dump do jogo em mãos.

## Estado da implementação

Concluída em 2026-08-31.

### Sinal escolhido

**`@shopsubcategory1 == "refinedresources"`** no `ITEM DUMP.json` — o mesmo sinal que o import
já usava pra `select_standard_refining_requirements`. `simpleitem` foi descartado como sinal:
essa categoria é um saco de gato (molho de peixe, trade packs, poções-base…), classificaria
1.100 receitas erradas.

### O que foi feito

1. `scripts/import_recipes.py`: `production_kind = "refining" if is_refined_resource else
   "crafting"`, gravado por receita (base e cada nível de encantamento). Sem mudança em
   `_dumps.py` (o sinal já estava na entrada).
2. **`Recipe.production_kind`** — `String(16)`, `CHECK IN ('refining','crafting')`, índice
   `ix_recipe_production_kind`. Migração `e6a1b2c3d4e5` (server_default `'crafting'` — seguro:
   nada aparece como refino por engano num install que não reseeda).
3. Bump de `STATIC_TRANSFORM_REVISION` (`…-production-kind-v1`) **e** do `transform_revision` no
   manifesto → o SHA-256 do manifesto muda → `apply_dataset` não vê `unchanged` → **reseeda e
   recalcula a coluna** em instalações já semeadas (caminho ciente do `W2`). `max_length` do
   campo subiu de 64 → 128.
4. `ranking_service.rebuild_ranking` lê `Recipe.production_kind` (`output_kind` dict); removido
   `_is_refining_category`. `RecipeRanking.is_refining` continua gravado, agora do dado.
5. `RecipeOut` ganha `production_kind` (detalhe de receita); `schema.d.ts` regenerado.
6. `docs/02-dados-de-receita.md`: seção nova documentando o sinal e a contagem.

### `B11` / índice — já resolvido pela task 03

O `ilike '%...%'` sem índice que o `B11` cita (`_refining_item_filter`) foi **removido na task
03** junto com o `recipe_opportunities` antigo. A leitura do ranking já filtra
`RecipeRanking.is_refining` por igualdade indexada (`ix_recipe_ranking_order`,
`ix_recipe_ranking_filters`). Esta task tira a última substring que sobrava — no **job**
(`rebuild_ranking`), não no request. `EXPLAIN` da leitura inalterado (medido na task 03:
`~0,6 ms`, top-N heapsort).

### Reclassificação (spec ponto 5)

Contra o dump real (revisão `5cf2e8e9…`, 5.633 receitas):

| | Heurística antiga (substring) | Nova (`refinedresources`) |
|---|---|---|
| `refining` | 150 | **110** |
| `crafting` | 5.483 | 5.523 |

**40 receitas (0,7%) mudam** — todas de `refining`→`crafting`, todas falsos-positivos da
substring `resource` (recursos crus `T5_WOOD`/`T5_ROCK`/… com receita de yield de gathering).
Nenhuma receita de refino real sai da lista (0 mudam de `crafting`→`refining`).

### Testes

- `uv run pytest tests/ -q` → **334 passed**. `uv run ruff check .` → limpo.
- `tests/static_data/test_production_kind.py` (novo): recurso refinado com `shop_category` fora
  do padrão de substring → `refining`; arma com "material" na subcategoria → `crafting`.
- `tests/static_data/test_seed.py::test_nova_revisao_de_transformacao_reaplica_dataset`:
  assert de que a coluna é recalculada na reaplicação.
- Testes de ranking/craft atualizados para passar `production_kind` no `Recipe(...)` dos seeds.
- Frontend `lint`/`typecheck`/`test` → 0 erros, 24 verdes.
