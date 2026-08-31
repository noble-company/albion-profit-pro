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
