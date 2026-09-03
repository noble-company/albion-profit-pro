# 04 — Contrato único de resultado financeiro

> Corrige `B04` e `B05`. Pré-requisito das tasks 07, 18 e 23.

## Objetivo

Fazer com que os mesmos nomes de campo signifiquem a mesma coisa em toda a API, e devolver as
taxas em vez de obrigar o cliente a deduzi-las.

## Por que

`OpportunityOut.gross_revenue` é preenchido de duas formas incompatíveis:

- em `/opportunities/flips`, recebe `revenue`, que já é `bruto - imposto - setup` — ou seja,
  **líquido**;
- em `/opportunities/refining` e `/crafting`, recebe `revenue["gross_revenue"]` — **bruto**.

Mesmo schema, mesmo nome, semântica invertida. A consequência aparece direto na UI: a coluna
"Taxas" de `opportunities/pages.tsx` só existe porque o frontend precisa **reconstruir** o valor
das taxas por engenharia reversa, com quatro `Number()` encadeados (`F09`).

O mesmo vale para `require_complete`: no flip descarta apenas o aviso `dado_velho`; na produção
descarta qualquer aviso, incluindo `sem_cobertura` e `profundidade_insuficiente`. O checkbox
"Cobertura completa" faz coisas diferentes em duas telas do mesmo produto.

## O que implementar

1. Separar os campos no schema, sem ambiguidade possível:
   `gross_revenue`, `sales_tax`, `setup_fee`, `net_revenue`, `total_cost`, `profit`, `roi`.
   Cada endpoint preenche todos, com o mesmo significado.
2. Alinhar a nomenclatura à de `craft/schemas.py`, que já está correta — o motor de craft é a
   referência, não o motor de oportunidades.
3. Definir **uma** semântica para `require_complete` e aplicá-la igual nos três endpoints.
   Se as duas semânticas forem úteis, virar dois parâmetros com nomes distintos
   (por exemplo "exigir cobertura" e "exigir dado fresco") — nunca um só com dois sentidos.
4. Alinhar `warnings` para que o mesmo conjunto de identificadores valha nos três endpoints.
5. Regenerar `frontend/src/api/schema.d.ts` e remover a coluna "Taxas" calculada no cliente,
   passando a exibir o campo devolvido pela API.
6. Atualizar `docs/11-formulas-de-craft.md` com o contrato final, já que ele é a referência
   numérica citada pelas outras specs.

## Depende de

Tasks 01, 02 e 03 (os dois motores precisam existir na forma nova antes de fixar o contrato).

## Testes automatizados

- Para a mesma oportunidade, `gross_revenue - sales_tax - setup_fee == net_revenue` nos três
  endpoints.
- `net_revenue - total_cost == profit` nos três endpoints.
- `require_complete=true` remove exatamente o mesmo tipo de linha em flip, refino e craft.
- Nenhum campo de dinheiro é serializado como número JSON — todos como string decimal.
- Teste de contrato que falha se um endpoint preencher `gross_revenue` com valor líquido.

## Testes manuais

Conferir na UI que a soma exibida (custo + taxas + lucro) fecha com o faturamento mostrado, sem
nenhuma conta feita no navegador.

## Estado da implementação

Concluída em 2026-08-31.

### `B04` — `gross_revenue`

`OpportunityOut` ganhou `sales_tax`, `sale_setup_fee`, `net_revenue`, `acquisition_setup_fee`,
`total_fees`. **`gross_revenue` passa a ser o faturamento bruto** em todos os endpoints (antes
carregava o líquido no flip e no ranking). Nomenclatura idêntica à de
`craft/schemas.py` (`RevenueBreakdownOut`/`CostBreakdownOut`).

- `flip_opportunities`: o SQL já calculava `gross`, `sales_tax`, `sell_setup`, `buy_setup`,
  `net_revenue` — agora todos sobem no `OpportunityOut`. `total_fees = sales_tax + sell_setup +
  buy_setup`.
- `ranking_service._project_row`: expõe os mesmos componentes da projeção.
- Contrato documentado em `docs/11-formulas-de-craft.md` (seção "Contrato de resultado nas
  oportunidades").

### `B05` — `require_complete`

Já estava alinhado após as tasks 02/03: flip filtra `is_stale=false` (seu único aviso é
`dado_velho`) e o ranking filtra `neutral_profit IS NOT NULL AND warnings == []`. As duas
condições são a mesma semântica — "precificado e sem aviso". Mantido **um** parâmetro; teste
`test_require_complete_drops_the_same_kind_of_row_everywhere` prova o alinhamento. `warnings` do
flip passou a usar `CraftWarning.STALE_DATA.value` explicitamente (mesmo vocabulário dos 3).

### Frontend

- `schema.d.ts` regenerado.
- `opportunities/pages.tsx`: coluna "Taxas" passou a exibir `row.total_fees` — **removida** a
  reconstrução com 4 `Number()` encadeados (`F09`). "Faturamento" agora mostra o bruto real.
- `production-pages.tsx`: nenhuma mudança necessária ("Venda bruta" já era o rótulo certo; só o
  dado ficou correto).

### Testes

- `uv run pytest tests/ -q` → **321 passed**. `uv run ruff check .` → limpo.
- `tests/opportunities/test_result_contract.py` (novo): identidades de receita/lucro nos 3
  endpoints · `total_fees` = soma das 3 taxas · `gross >= net` (falha se um endpoint puser
  líquido em `gross_revenue`) · todo campo monetário é string · `require_complete` remove o mesmo
  tipo de linha nos 3.
- `test_flips.py`: asserts de `gross_revenue` atualizados (600/2000 em vez de 576/1790) + novos
  asserts de `sales_tax`/`net_revenue`/`total_fees`.
- Frontend `npm run lint && npm run typecheck && npm run test` → 0 erros, 24 verdes.
