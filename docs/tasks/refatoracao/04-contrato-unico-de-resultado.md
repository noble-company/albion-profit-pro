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
