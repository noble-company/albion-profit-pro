# 10 — Tipo único de dinheiro no contrato

> Corrige `P07`.

## Objetivo

Fazer o mesmo campo monetário sair com o mesmo tipo em todas as rotas, fechando a última porta
por onde dinheiro entra no frontend como número de ponto flutuante.

## Por que

A regra da Fase 3.5 é "dinheiro é string decimal ponta a ponta" (`F09`, task 3.5/18). O contrato
não cumpre isso para `recipe_silver_cost`:

| Arquivo | Tipo |
|---|---|
| `backend/src/craft/schemas.py:100,167` | `Decimal` → sai como string |
| `backend/src/opportunities/schemas.py:26` | `int` → sai como número JSON |
| `backend/src/recipes/schemas.py:29` (`silver_cost`) | `int` → número JSON |

E isso aparece de forma literal no cliente gerado:

- `frontend/src/api/schema.d.ts:730` e `:779` — `recipe_silver_cost: string`
- `frontend/src/api/schema.d.ts:1370` — `recipe_silver_cost: number`

As próprias fixtures já discordam entre si: `src/opportunities/production-pages.test.tsx:129` usa
`'0'` (string) e `:340` usa `12` (número) para o mesmo campo.

O consumo é `money(c.recipe_silver_cost)` em `src/lib/ranking-projection.ts:75`, e `money` aceita
`number` (`src/lib/money.ts:31`, `MoneyInput = string | number | Decimal`). Para inteiro abaixo de
2^53 o valor é exato, então **não há bug vivo hoje** — mas é a rachadura: um valor monetário
atravessa o contrato como IEEE-754 e só depois vira `Decimal`. Se um dia for fracionário ou
grande, a `F09` já terá sido violada antes de o frontend tocar no dado.

`produced_quantity`, `executions` e `crafting_focus` também são `number` (`schema.d.ts:1376`) —
esses são contagens, e número é o tipo certo. A questão é só o que é prata.

## O que implementar

1. Padronizar `recipe_silver_cost` e `silver_cost` como `Decimal` nos schemas de
   `opportunities/` e `recipes/`, de modo que saiam como string decimal nas três rotas.
2. Regenerar `frontend/src/api/schema.d.ts` (`npm run api:types`) e corrigir os consumidores e as
   fixtures divergentes.
3. Varrer o restante dos schemas atrás do mesmo padrão: qualquer campo de prata tipado como `int`
   ou `float` fora dos `*In` de ingest. `silver_cost_per_execution` (`craft/schemas.py:88`) é
   candidato — decidir e deixar coerente.
4. Endurecer `money.ts`: separar a entrada de fórmula da entrada de apresentação, de modo que os
   caminhos de cálculo aceitem só `string | Decimal`. É o item que fecha a porta de vez; o
   `number` continua aceitável em formatação.
5. Corrigir também as **anotações** no backend: `src/opportunities/models.py:84-87,105-106` e
   `src/recipes/models.py:56` declaram `Mapped[float | None]` sobre colunas `Numeric`. Em runtime
   vem `Decimal` (o `Numeric` explícito manda), mas a anotação mente para quem lê e para o type
   checker.

## Depende de

Task 06 (as duas alteram OpenAPI; fazer em sequência evita regenerar `schema.d.ts` duas vezes com
conflito).

## Testes automatizados

- As três rotas devolvem `recipe_silver_cost` como string decimal — teste no limite HTTP, não no
  service.
- Vetores dourados de projeção continuam batendo string a string depois da mudança de tipo.
- `npm run typecheck` verde com o `schema.d.ts` regenerado.
- Um teste que prove que os caminhos de fórmula de `money.ts` recusam `number`.

## Testes manuais

Comparar uma linha do ranking de refino com o `POST /craft/simulate` da mesma receita: o custo de
receita tem que ser idêntico nas duas telas.
