# 18 — Módulo monetário e vetores dourados

> Corrige `F09`. É o **guarda-corpo** que torna a task 23 segura.

## Objetivo

Permitir que o frontend calcule dinheiro sem introduzir uma segunda verdade nem erro de
ponto flutuante.

## Por que

O README da própria Fase 3 estabelece: *"Dinheiro viaja como string decimal. O frontend apenas
formata, sem converter para `number` nem executar aritmética monetária."* A regra é violada no
código entregue:

- `rows.reduce((sum, row) => sum + Number(row.profit ?? 0), 0)` — o KPI "Lucro na página";
- a coluna "Taxas", com quatro `Number()` encadeados reconstruindo o valor que a API não manda;
- `Number(row.roi)` e `Number(row.profit)` na função de ordenação;
- `Number(ingredient.expected_return_quantity) > 0` nas tabelas de produção.

Duas consequências. Precisão: somas de prata passam de `Number.MAX_SAFE_INTEGER` com folga num
jogo onde valores de dezenas de milhões são rotina. E arquitetura: a task 23 vai mover o "e se"
para o cliente — fazer isso sobre `number` transformaria um problema de exibição num problema de
resultado errado.

O backend resolve isso com `Decimal` e arredondamento explícito por taxa
(`calculate_percentage_charge` usa `ROUND_CEILING` em cada cobrança, separadamente). Reproduzir
esse comportamento em JavaScript sem um tipo decimal é impossível.

## O que implementar

1. Escolher e fixar o tipo decimal do frontend: `decimal.js` (ou equivalente maduro), ou
   aritmética em inteiro/`BigInt` na menor unidade. Registrar o racional da escolha.
2. Criar `src/lib/money.ts` com as operações permitidas — soma, subtração, multiplicação por
   quantidade, percentual com arredondamento **idêntico** ao do Python, comparação e formatação.
   `formatarSilver` passa a operar sobre esse tipo.
3. **Portar as fórmulas de `craft/formulas.py` que o cliente precisa** para
   `src/lib/craft-formulas.ts`, mantendo os mesmos nomes e a mesma ordem de arredondamento.
   Nada de reinterpretar: a referência é `docs/11-formulas-de-craft.md`.
4. **Vetores dourados.** Script no backend que gera um arquivo de casos
   (`tests/fixtures/golden/craft-vectors.json`) a partir do motor Python: entradas e resultados
   esperados, cobrindo taxas, retorno, foco, produção com sobra, ROI nulo, custo zero e bordas de
   arredondamento. O mesmo arquivo é consumido pelos testes dos **dois** lados.
5. Regra de lint que proíbe `Number(...)` e `parseFloat(...)` sobre campo monetário.
6. Remover a coluna "Taxas" calculada no cliente, consumindo o campo que a task 04 devolve.

## Depende de

Tasks 04 e 15. **Bloqueia a task 23.**

## Testes automatizados

- Todos os vetores dourados passam em Python e em TypeScript com resultado idêntico.
- Alterar uma taxa no Python sem regenerar os vetores quebra o teste do frontend — é isso que
  impede as duas implementações de divergirem.
- Soma de valores acima de `Number.MAX_SAFE_INTEGER` continua exata.
- Arredondamento de percentual bate com `ROUND_CEILING` do Python, cobrança a cobrança.
- Lint falha se `Number()` for aplicado a campo monetário.

## Testes manuais

Conferir numa oportunidade real que o lucro exibido pela UI é idêntico, dígito a dígito, ao
devolvido por `POST /craft/simulate` para o mesmo cenário.

---

## Estado da implementação

**Concluída.** Backend: `uv run pytest tests/ -q` → **341 passed** (+3) · `uv run ruff check .`
limpo. Frontend: `npm run typecheck` limpo · `npm run lint` 0 erros (4 warnings
pré-existentes) · `npm run test` **98/98 em 20 arquivos** (+10) · `npm run build` passa.

### Decisão: `decimal.js` (fixado `10.6.0`)

Não `number` (perde precisão acima de `2^53`), não `BigInt` (o ROI é `lucro / custo`, divisão
com casas decimais que BigInt não faz limpo). `decimal.js` configurado para **espelhar o
contexto `decimal` padrão do Python** — `precision: 28`, `ROUND_HALF_EVEN`,
`toExpNeg/toExpPos` no extremo (`.toString()` nunca vira notação exponencial). É isso que
permite os vetores dourados baterem string a string. `ROUND_CEIL`/`ROUND_FLOOR` batem 1:1 com
`ROUND_CEILING`/`ROUND_FLOOR`.

### Frontend (novos)

- **`src/lib/money.ts`** — `money`, `add`, `subtract`, `multiplyByQuantity`,
  `percentageCharge` (= `ceil(base × taxa)`, cada cobrança isolada, idêntico ao Python),
  `ceilToInteger`, `compare`, `isPositive`, `isZero`, `roundDownForDisplay`, `formatSilver`,
  `formatPercent`.
- **`src/lib/craft-formulas.ts`** — porte das 9 funções puras de `craft/formulas.py`
  (`calculateProduction`, `calculateIngredientRequirement`, `calculateFocusConsumed`,
  `calculatePercentageCharge`, `calculateAcquisitionCost`, `calculateSaleRevenue`,
  `calculateFinancialResult`, `ceilDecimal`, `roundDownForDisplay`), mesmos nomes em
  camelCase, mesma ordem de arredondamento. Referência: `docs/11-formulas-de-craft.md`.
- **`src/lib/money.test.ts`** — soma acima de `MAX_SAFE_INTEGER` exata, `percentageCharge`
  arredonda por-cobrança, `roundDownForDisplay` trunca para −∞, formatação.
- **`src/lib/craft-formulas.golden.test.ts`** — roda o porte TS sobre os vetores dourados.

### Frontend (alterados)

- **`src/lib/formatters.ts`** — `formatarSilver`/`formatarPct` viram alias de
  `money.formatSilver`/`formatPercent`. O cliente não converte silver para `number`.
- **`src/opportunities/pages.tsx`** — KPI "Lucro na página" = `money.add(...)`. Removidos os
  fallbacks `String(Number(row.buy_price) * row.quantity)` (dead code — a API sempre manda
  `total_cost`/`gross_revenue` desde a task 04).
- **`src/opportunities/production-pages.tsx`** — `Number(expected_return_quantity) > 0` vira
  `money.isPositive(...)`.
- **`eslint.config.js`** — regra `no-restricted-syntax`: `Number(x.<campo monetário>)` /
  `parseFloat`/`parseInt` sobre ~20 campos do contrato financeiro falham o lint (erro, não
  warning). Verificado que dispara.

### Backend (novos)

- **`scripts/generate_craft_vectors.py`** — matriz de 37 casos por função (taxas 0/1, base 0,
  base > `2^53`, retorno, retorno inelegível, foco, produção com sobra, ROI nulo, custo zero,
  bordas de arredondamento, divisão não-exata) → `tests/fixtures/golden/craft-vectors.json`.
  Decimals serializados na forma canônica (`format(x.normalize(), 'f')`) — a mesma que o
  `.toString()` do `decimal.js` produz.
- **`tests/craft/test_golden_vectors.py`** — (1) cada vetor bate com uma chamada fresca do
  `formulas.py`; (2) o arquivo committado é idêntico ao regerado (mudou taxa/matriz sem
  regerar → quebra); (3) as taxas registradas batem com `craft/constants.py`.

**Vetor dourado é um arquivo só** em `backend/tests/fixtures/golden/`. O teste do frontend lê
via `node:fs` (`../backend/tests/fixtures/golden/craft-vectors.json`) — monorepo, checkout
único.

### Testes automatizados — os 5 bullets

- ✅ Vetores passam idênticos nos dois lados (98/98 frontend inclui o golden; 341 backend
  inclui `test_golden_vectors`).
- ✅ **Verificado:** bumpei `DEFAULT_SETUP_FEE_RATE` de `0.025` p/ `0.03` →
  `test_committed_file_is_up_to_date` e `test_rates_recorded_match_the_constants` falharam;
  revertido. Regerar então mudaria os `expected` e o teste TS rodaria contra os novos valores.
- ✅ `money.test.ts`: `add('9007199254740993', '2') === '9007199254740995'` (number erraria).
- ✅ `percentageCharge('1501', '0.04') === '61'` (não `60`); imposto e setup nunca somam antes
  do teto.
- ✅ Regra de lint verificada com um arquivo-sonda.

### Desvios da spec

- **`formatarPct` mudou de comportamento nas bordas:** antes `Number(v).toFixed(1)`
  (arredonda meio pra cima); agora `roundDownForDisplay` (trunca para baixo, `18.4999 → 18,4`)
  — que é o que `docs/11` manda ("arredondando para baixo", `-2,525 → -2,6`). Nenhum teste
  cobria isso; o novo comportamento é o correto pelo contrato.
- **Item 6 já estava quase pronto:** a coluna "Taxas" já consumia `row.total_fees` (task 04).
  O único resíduo era o fallback dead-code de `total_cost`/`gross`, removido.
- **`formatQuantity` e `percentageToRate`** ainda usam `Number()` — em quantidade pequena de
  retorno (não silver) e num percentual digitado pelo usuário. Não são "campo monetário" e o
  lint não os pega; ficam como estão.

### Testes manuais que já rodei

Nenhum — o item da seção "Testes manuais" (conferir dígito a dígito UI vs `/craft/simulate`
numa oportunidade real) exige backend com dados e olhos na tela. O equivalente — o motor de
dinheiro do cliente produz exatamente o mesmo que o Python — está travado pelos vetores
dourados.

### Pendente pra você testar

1. `npm run dev` + backend com dados, abrir uma oportunidade de Refino/Craft, clicar
   "Analisar" (chama `POST /craft/simulate`) e conferir que o **lucro e o ROI** da linha da
   tabela e os do drawer batem **dígito a dígito**.
