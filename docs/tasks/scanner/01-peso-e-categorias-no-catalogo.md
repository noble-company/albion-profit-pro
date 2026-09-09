# 01 — Peso e categorias no catálogo de itens

> Habilita **Lucro p/KG**, a métrica central da planilha do usuário, e o filtro por categoria.

## Objetivo

Importar `@weight` do `ITEM DUMP.json` para a tabela `item`, e confirmar que
`shop_category`/`shop_subcategory*` estão populados o suficiente para servir de filtro no
scanner.

## Por que

A planilha de referência tem as colunas **"Peso Recursos"** e **"Lucro p/KG"** — em Albion, o
que decide o que vale produzir muitas vezes não é o lucro absoluto, e sim o lucro por unidade
de peso, porque a capacidade de carga é o gargalo real do transporte entre cidades.

`docs/02-dados-de-receita.md:165` já lista `@weight` como campo útil, mas ele **nunca foi
importado**: `scripts/import_items.py:64-79` (`load_dump_metadata`) lê `@tier` e as quatro
`@shopcategory*`, e para por aí. `src/items/models.py:19-30` não tem coluna de peso.

Medido no dump real: **5.794 entradas** têm `@weight`, e são as entradas de item de verdade
(nó `simpleitem`/`equipmentitem`), não as referências aninhadas em `craftingrequirements` —
exatamente o mesmo nó de onde `@tier` já é lido hoje com sucesso. Amostra: `T4_FIBER` 0.51,
`T4_CLOTH` 0.51, `T5_METALBAR` 0.76, `T6_ORE` 1.14, `T4_PLANKS` 0.51.

## O que implementar

1. **Migração Alembic**: `item.weight` como `Numeric(10, 4)` nullable. Decimal, não float — o
   peso entra numa divisão que vira número exibido (`lucro / peso`), e a regra `F09` vale para
   toda aritmética que o usuário lê.
2. **`src/items/models.py`**: `weight: Mapped[Decimal | None] = mapped_column(Numeric(10, 4))`.
3. **`scripts/import_items.py`**:
   - `load_dump_metadata` (`:64-79`) — adicionar `"weight": entry.get("@weight")` ao dict de
     metadados, convertendo para `Decimal` (o dump traz string).
   - `build_items` (`:97-115`) — adicionar `"weight": meta.get("weight")` à linha.
   - `apply_item_import` (`:139-153`) — adicionar `"weight": stmt.excluded.weight` ao `set_` do
     upsert, senão a reexecução não atualiza o peso.
   - A resolução por `_base_name` (`:96`) continua valendo: variante encantada herda o peso da
     base, que é o comportamento correto do jogo.
4. **Confirmar as categorias**: contar quantos itens têm `shop_category` não nulo e listar as
   categorias distintas. Se a cobertura for baixa a ponto de inviabilizar o filtro da task 09,
   registrar como achado da fase — **não** consertar aqui.

## Bibliotecas/dependências

Nenhuma nova. `Numeric` do SQLAlchemy, `Decimal` da stdlib.

## Depende de

Nada. É a primeira task da fase.

## Testes automatizados

- `load_dump_metadata` devolve `weight` como `Decimal` para um item conhecido (`T4_FIBER` →
  `Decimal("0.51")`), e `None` para entrada sem `@weight`.
- `build_items` propaga o peso, e a variante encantada (`T4_FIBER_LEVEL3@3`) herda o peso da
  base pelo `_base_name`.
- Reexecução do import **atualiza** o peso de uma linha existente (prova que o `set_` do upsert
  foi mesmo estendido — teste em vermelho antes da correção).
- Nenhum item perde `tier`/`shop_category` por causa da mudança (regressão do import).

## Testes manuais

Após `uv run python -m scripts.import_items`:

```sql
SELECT count(*) FILTER (WHERE weight IS NOT NULL) AS com_peso, count(*) AS total FROM item;
SELECT unique_name, tier, weight, shop_category, shop_subcategory
  FROM item WHERE unique_name IN ('T4_FIBER','T4_CLOTH','T6_ORE','T5_METALBAR');
```

Conferir que os pesos batem com o que o jogo mostra na tooltip do item.

## Estado da implementação

**Concluída.** `uv run pytest tests/ -q` → **354 passed** (+4) · `uv run ruff check .` e
`ruff format --check .` limpos.

- **Migração `a7f3c2b9d0e4`** — `item.weight` `Numeric(10,4)` nullable. Escrita **à mão, não por
  `--autogenerate`**: `src/items/models.py` não declara `ix_item_busca_normalizada_trgm`, então
  um autogenerate sobre `item` emitiria um `op.drop_index` espúrio (achado `E08`, task 3.6/09,
  ainda aberta). O motivo está na docstring da migração.
- **`src/items/models.py`** — coluna `weight: Mapped[Decimal | None]`.
- **`scripts/import_items.py`** — helper `_weight()` converte a string do dump para `Decimal`
  (nunca por `float`); `load_dump_metadata`, `build_items` e o `set_` do upsert de
  `apply_item_import` passam a carregar o peso.

### Guard em vermelho antes da correção

Removendo `"weight": stmt.excluded.weight` do `set_` do upsert,
`test_reimport_atualiza_peso_de_linha_existente` falha com
`assert Decimal('0.5100') == Decimal('1.2500')` — a reexecução não corrigia o peso. Com a linha,
passa.

### Resultado do import real

`uv run python -m scripts.import_items` → 12.062 itens, 9 pulados (os mesmos tokens cosméticos
de sempre).

| Métrica | Valor |
|---|---|
| Itens com `weight` | **9.305** de 12.062 (77%) |
| Itens com `shop_category` | 9.306 |
| Itens com `tier` | 9.306 |

A cobertura de peso é praticamente idêntica à de tier/categoria — vem do mesmo nó do dump. Os
~2.750 sem peso são os que já não tinham entrada no `ITEM DUMP.json` (cosméticos, tokens,
consumíveis de evento), nenhum deles saída ou ingrediente de receita.

Amostra conferida (item 4 da spec — categorias servem de filtro, nenhum achado a registrar):

| Item | Tier | Peso | Categoria |
|---|---|---|---|
| `T4_FIBER` | 4 | 0,51 | crafting / resources |
| `T4_CLOTH` | 4 | 0,51 | crafting / refinedresources |
| `T5_METALBAR` | 5 | 0,76 | crafting / refinedresources |
| `T6_ORE` | 6 | 1,14 | crafting / resources |
| `T6_FIBER_LEVEL3@3` | 6 | 1,14 | crafting / resources |

A variante encantada herda o peso da base, como previsto.

### Pendente pra você testar

Abrir a tooltip de `T4_FIBER` e `T6_ORE` no jogo e confirmar que o peso bate com 0,51 e 1,14.
