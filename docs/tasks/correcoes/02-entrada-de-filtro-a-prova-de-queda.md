# 02 — Entrada de filtro à prova de queda

> Corrige `E02` e `E03`.

## Objetivo

Impedir que um valor digitado num campo de filtro chegue à camada de projeção em formato que o
`decimal.js` recusa ou em faixa que as fórmulas proíbem.

## Por que

`FilterNumber` (`frontend/src/components/opportunities/FilterPanel.tsx:137-160`) é um `input` de
texto livre — `inputMode="decimal"`, sem `type="number"`, sem `min`/`max`, sem sanitização — e o
`onChange` escreve direto no parâmetro da URL.

**Vírgula decimal derruba a tela.** `production-pages.tsx:72` lê `station_cost` cru e
`ranking-projection.ts:76` faz `money(params.stationCostPerExecution)`. Reproduzido:

```
new Decimal('1,5')  →  [DecimalError] Invalid argument: 1,5
```

O campo de retorno normaliza a vírgula (`production-pages.tsx:65`); o de "Estação por execução"
**não**. E vírgula é o separador decimal do próprio locale que o app usa pra formatar
(`money.ts:114,138,142`), além de ser o que o teclado numérico oferece em pt-BR.

**Retorno acima de 100% derruba a tela.** `150` no campo de retorno produz `returnFactor = -0.5`
(`ranking-projection.ts:77`), custo de ingrediente negativo (`:99`) e `percentageCharge` lança
`RangeError('base deve ser não-negativa')` (`money.ts:65`) no ramo `buy_order` (`:102`).

Os dois estouram **durante o render**, no `useMemo` de `production-pages.tsx:137-143`.

Repare na assimetria: `craft-formulas.ts:56-60` tem `validateRate` e guardas de não-negatividade
em toda função, com testes dedicados em `craft-formulas.guards.test.ts`. O
`ranking-projection.ts` — o caminho que o usuário exercita a cada tecla — não tem guarda nenhuma.

## O que implementar

1. Sanitizar no `FilterNumber`: normalizar vírgula para ponto e recusar caracteres não numéricos
   antes de propagar o `onChange`. O componente é compartilhado (task 3.5/20), então a correção
   vale para todos os campos numéricos de filtro de uma vez.
2. Clampar o retorno em `[0, 100]%` na entrada, com o limite visível para o usuário — não
   silenciosamente.
3. **Guardar também a fronteira de cálculo**, não só a UI: `projectRankingRow`
   (`ranking-projection.ts:70-77`) deve validar `returnRate` e `stationCostPerExecution` como
   `craft-formulas.ts:56-60` faz, reusando `validateRate`. Entrada inválida vindo de URL colada à
   mão não pode depender do componente ter sanitizado.
4. Decidir e documentar o comportamento para param de URL inválido: cair no default e avisar, ou
   mostrar estado de erro. Não pode ser exceção durante o render.

## Depende de

Task 01 (as duas mexem em `percentageToRate` e no caminho de entrada da projeção; fazer na ordem
evita conflito).

## Testes automatizados

- `1,5` em "Estação por execução" não lança e produz o mesmo resultado de `1.5`.
- `150` no retorno não lança; o valor efetivo é `100%`.
- `?station_cost=abc` e `?return_rate=-5` na URL renderizam a tela sem exceção.
- `projectRankingRow` com `returnRate` fora de `[0,1]` levanta erro tipado, não `RangeError` de
  dentro do `money`.
- Os testes devem falhar antes da correção — registrar a execução em vermelho.

## Testes manuais

Em `/refino`, digitar `1,5` em "Estação por execução" e `150` em "Retorno de recurso (%)". Nos
dois casos a tabela continua na tela.
