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

## Estado da implementação

**Concluída** (2026-09-22). Backend: `uv run pytest tests/` — **489 passed, 1 skipped**;
`ruff check .`/`ruff format --check .` limpos. Frontend: `npm run lint` (0 erros),
`npm run typecheck` (limpo, `schema.d.ts` regenerado), `npm run test` — **596 passed** (era 595).

- **Item 1 — divergência real vs. spec.** `opportunities/schemas.py` **não tem mais**
  `recipe_silver_cost` — o campo saiu de vez quando a Fase 4 reescreveu o flip em SQL (ranking
  materializado aposentado, task 4/15). O achado original da spec ficou obsoleto por outra
  task, não por esta. `recipes/schemas.py` (`RecipeOut.silver_cost`) era o único campo real
  ainda `int`, corrigido para `Decimal`.
- **Item 3 — achado além da spec.** Varrendo "o resto dos schemas" achei `catalog/schemas.py`
  (`CatalogRecipeOut.silver_cost`) também `int` — **não estava na lista original**, mas é o
  campo que `GET /catalog/recipes` expõe pro scanner inteiro (client-side, task 4). Era o de
  maior alcance real: todo o motor de cálculo do navegador (`frontend/src/scanner/engine.ts`)
  lê esse valor. Corrigido junto. `craft/schemas.py` (`silver_cost_per_execution`) também
  corrigido, como a spec já cogitava.
- **Item 5 — já estava resolvido.** `opportunities/models.py` (que a spec cita) **não existe
  mais** (mesma reescrita da Fase 4). `recipes/models.py:56` hoje é `production_kind: Mapped[str]`
  — não é o campo float que a spec descrevia; a referência de linha ficou desatualizada. Varri
  **todo** `Mapped[float]`/`Numeric(...)` do backend: o único `Mapped[float]` sobre `Numeric` é
  `craft_time` (`recipes/models.py:57`), que é tempo, não prata — a própria spec já excluía
  ("a questão é só o que é prata"). Nenhuma mudança necessária.
- **Item 4 — `money.ts` endurecido.** Novo tipo `FormulaInput = string | Decimal`, usado em
  `money`, `add`, `subtract`, `divide`, `compare`, `isZero`, `isPositive`, `percentageCharge`,
  `ceilToInteger`, `multiplyByQuantity` (só o lado do valor — `quantity` continua `number`, é
  contagem). `MoneyInput` (com `number`) ficou só para as três funções de apresentação
  (`formatSilver`/`formatQuantity`/`formatPercent`) e `roundDownForDisplay`, agora usando uma
  `moneyForDisplay()` interna (exportada) em vez de `money()`. `craft-formulas.ts` (porte das
  fórmulas do Python) recebeu o mesmo tratamento.
- **Regenerar `schema.d.ts` surfaceou 9 call sites reais** passando `number` pro lado do
  dinheiro em `divide`/`multiplyByQuantity` — todos eram contagem (`producedQuantity`,
  `focusConsumed`, `partes.length`) dividindo/multiplicando um valor monetário, não dinheiro
  em si. Corrigidos com `String(contagem)` no call site — a fronteira fica exatamente onde a
  spec pedia: sem `number` no lado do valor, contagem continua `number`.

### Desvios da spec

- Escopo do item 1 mudou (opportunities/ não tem mais o campo; catalog/ tinha o mesmo problema
  e não estava listado) — documentado acima, não é uma omissão desta implementação.
- Item 5 não exigiu nenhuma mudança de código — a spec descrevia um estado que duas reescritas
  da Fase 4 já haviam resolvido antes desta task existir.

### Guard em vermelho (prova de que o teste novo morde)

Alarguei `FormulaInput` de volta para `string | number | Decimal` temporariamente e rodei
`npm run typecheck`: os 9 `@ts-expect-error` do teste novo em `money.test.ts` viraram
`TS2578: Unused '@ts-expect-error' directive` — a marca de que, sem a restrição, aquelas
chamadas deixariam de ser erro. Revertido em seguida; `npm run typecheck` voltou a ficar limpo.

### Pendente pra você testar

- **Comparação visual Refino × `/craft/simulate`** (teste manual da spec): os vetores dourados
  já provam que os dois motores (Python e o port TypeScript) concordam número a número, mas ver
  a mesma receita nas duas telas do produto real é verificação visual — abrir uma receita no
  ranking de Refino, anotar o custo de receita mostrado, abrir "Analisar com o livro real" da
  mesma linha e comparar com `recipe.silver_cost_per_execution × executions` da resposta.
