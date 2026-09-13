# 01 — Aritmética decimal na entrada do usuário

> Corrige `E01`.

## Objetivo

Fazer o valor que o usuário digita entrar na camada "e se" como `Decimal`, para que o cálculo do
cliente volte a bater com o motor Python.

## Por que

`frontend/src/opportunities/production-pages.tsx:63-67`:

```ts
function percentageToRate(value: string) {
  if (!value) return '0'
  const numeric = Number(value.replace(',', '.'))
  return Number.isFinite(numeric) ? String(numeric / 100) : '0'
}
```

`Number(v)/100` é divisão em ponto flutuante. Reproduzido em Node com as taxas de retorno reais
do jogo:

| Digitado | `Number(v)/100` | `Decimal(v).div(100)` |
|---|---|---|
| `36.7` | `0.36700000000000005` | `0.367` |
| `8.8` | `0.08800000000000001` | `0.088` |
| `2.9` | `0.028999999999999998` | `0.029` |
| `1.1` | `0.011000000000000001` | `0.011` |

O resultado vai para `ProjectionParams.returnRate` e daí para `ranking-projection.ts:74,77`
(`ONE.minus(returnRate)`), `projectedIngredientCost` (`:99`), `totalCost` (`:104`) e `roi`
(`:119-123`). O `decimal.js` propaga os dígitos de lixo fielmente. O Python calcularia
`Decimal('36.7') / 100 == Decimal('0.367')`.

Ou seja: **o cliente e o servidor divergem no mesmo insumo** — exatamente o que a `F09` (task
3.5/18) e os vetores dourados (task 3.5/23) existem pra impedir. Os vetores não pegaram porque
`projection-vectors.json` alimenta `return_rate` **já como string normalizada** (`"0.15"`,
`"0.248"`); o caminho que o usuário realmente exercita não tem vetor nenhum.

`36.7%` não é um valor de laboratório: é a taxa de retorno de refino com bônus de cidade.

## O que implementar

1. Reescrever `percentageToRate` sobre `@/lib/money`: `money(normalizado).div(100).toString()`,
   mantendo a normalização de vírgula para ponto e o fallback `'0'` para entrada vazia.
2. `src/lib/money.ts` não expõe divisão. Adicionar `divide(a, b)` ali e usá-la, em vez de chamar
   `.div()` solto — o módulo existe pra ser a fronteira única da aritmética monetária, e hoje a
   divisão de ROI também acontece fora dele (`ranking-projection.ts:121`,
   `craft-formulas.ts:200-201`).
3. Estender `backend/scripts/generate_projection_vectors.py` e
   `backend/tests/fixtures/golden/projection-vectors.json` com casos cujo `return_rate` seja o
   **percentual digitado** (`36.7`, `8.8`, `2.9`), não a taxa já normalizada, para que a
   conversão passe a ser parte do contrato travado.
4. Varrer o restante do frontend por outras conversões de entrada que fujam de `money`:
   `readProductionExtra` (`production-pages.tsx:69-75`) e os leitores de param de
   `useOpportunityParams.ts:20-23,52`.

## Depende de

Nada. É a primeira task da fase.

## Testes automatizados

- `percentageToRate('36.7')` devolve exatamente `'0.367'` — teste em vermelho antes da correção.
- Os vetores dourados novos passam nas duas implementações (Python e TS) comparando string a
  string, como `ranking-projection.golden.test.ts` já faz.
- Vírgula decimal (`'36,7'`) produz o mesmo resultado que ponto.
- Entrada vazia continua devolvendo `'0'`.

## Testes manuais

Em `/refino` com ranking materializado, digitar `36,7` no campo de retorno e comparar o lucro da
linha com o `POST /craft/simulate` da mesma receita em "Analisar" — os dois têm que fechar.

## Estado da implementação

Concluída. Verificada com `npm run lint && npm run typecheck && npm run test` (frontend, 204
testes) e `uv run pytest tests/opportunities/test_projection_vectors.py -v && uv run ruff check`
(backend, 3 testes).

- `percentageToRate` e `readProductionExtra` saíram de `production-pages.tsx` para o módulo novo
  `frontend/src/opportunities/production-params.ts` (exportá-los de um `.tsx` que também exporta
  componentes dispara o warning do `react-refresh`, e o teste dourado precisa importar
  `percentageToRate` sem puxar React Router). A reescrita ficou
  `money.divide(value.replace(',', '.'), 100).toString()`, com `try/catch → '0'` preservando o
  fallback que o antigo `Number.isFinite` dava para entrada não numérica.
- `money.ts` ganhou `divide(a, b)`. Além de `percentageToRate`, os `.div()` soltos de
  `ranking-projection.ts` (ROI `:121`, `buy_price`/`sell_price` `:183,185`) e de
  `craft-formulas.ts` (`profitPerUnit`, `roi` `:200-201`) passaram a usá-lo — comportamento
  idêntico, é a mesma fronteira monetária.
- `generate_projection_vectors.py` aceita `return_rate_percent` no `params` (resolve
  `Decimal(pct) / 100`); 3 casos novos (`36.7`, `8.8`, `2.9`). O teste dourado do frontend
  aplica `percentageToRate` quando o vetor traz o percentual.
- Varredura do item 4: `readProductionExtra` passa `station_cost` como string direto para
  `money(...)` (sem aritmética em ponto flutuante — o crash com vírgula é `E02`, task 02); os
  leitores de `useOpportunityParams.ts` (`numeric()`, `offset`) fazem `Number()` só sobre
  filtros **inteiros** não monetários (tier/encantamento/qualidade/offset). Nenhuma outra
  conversão de entrada faz aritmética de dinheiro fora de `money`.

### Guards em vermelho antes da correção

- `production-params.test.ts` → `percentageToRate('36.7')` devolvia `'0.36700000000000005'`
  (esperado `'0.367'`); `'8,8'` devolvia `'0.08800000000000001'`.
- `ranking-projection.golden.test.ts` → com a conversão via `Number`, o caso `36.7%` produzia
  `total_cost: '3552.19999999999973'` contra o `'3552.2'` do `_project_row` (Python).
