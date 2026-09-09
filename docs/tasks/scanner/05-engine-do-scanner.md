# 05 — Engine do scanner (Web Worker)

> Corrige `X03`. É onde o cálculo sai do servidor e vai para o navegador.

## Objetivo

Calcular **todas** as receitas do catálogo contra o snapshot de preço, no navegador, em tempo de
mudar um filtro — sem requisição e sem esperar job nenhum.

## Por que

O motor já existe e ninguém usa. `src/lib/craft-formulas.ts` é o porte completo de
`backend/src/craft/formulas.py`, travado por vetores dourados desde a task 3.5/18 — e um `grep`
mostra que **nenhuma tela o importa**. As telas chamam `POST /craft/simulate` ou leem o ranking
materializado.

Com o catálogo (task 02) e o snapshot (task 03) na mão, o navegador tem tudo para fazer a conta
que o job de 10 em 10 minutos fazia. 110 receitas de refino é uma planilha; 5.523 de craft são
~22 mil cenários numa cidade — dezenas a centenas de milissegundos, e num Worker isso não trava
a interface.

## O que implementar

1. **`src/lib/craft-constants.ts`** — extrair `PREMIUM_SALES_TAX_RATE` (0.04),
   `NON_PREMIUM_SALES_TAX_RATE` (0.08) e `SETUP_FEE_RATE` (0.025), hoje privadas em
   `ranking-projection.ts:22-24`. O engine precisa delas e uma terceira cópia divergiria.
   Espelha `backend/src/craft/constants.py`.

2. **`src/scanner/prices.ts`** — desfaz o formato colunar do `/prices/snapshot` num índice
   `Map` por `item|location|quality|enchantment`, para o engine consultar em O(1).

3. **`src/scanner/engine.ts`** — função pura `computeScanner(catalog, priceIndex, params)`:

   Para cada receita × cada cidade pedida, avalia os **4 cenários** (aquisição imediata ×
   ordem de compra, venda imediata × ordem de venda) e devolve o mais lucrativo, como
   `ranking_service._project_row` já faz no servidor. Composto sobre `craft-formulas.ts`, nunca
   reimplementando fórmula.

   Semântica dos lados, que é onde é fácil errar:

   | Modo | Preço usado | Significado |
   |---|---|---|
   | Comprar imediato | `sell_min` | pego a oferta mais barata do livro |
   | Ordem de compra | `buy_max` | entro na fila da maior ordem de compra |
   | Vender imediato | `buy_max` | vendo para a maior ordem de compra |
   | Ordem de venda | `sell_min` | anuncio junto da oferta mais barata |

4. **Estado explícito por linha**, nunca linha ausente:
   `priced | missing_ingredient_price | missing_output_price | no_price`.
   Uma receita sem preço **existe** na saída do engine, com os campos financeiros nulos e o
   motivo dito — é o `X01`/`X02` resolvido na camada de cálculo.

5. **Métricas novas** (as que a planilha do usuário tem e o produto não):
   - **lucro por peso** = `lucro / (peso da saída × quantidade produzida)` — nulo quando o item
     não tem peso.
   - **lucro por foco** = `lucro / foco consumido` — nulo quando `useFocus` está desligado ou o
     foco é zero.

6. **`src/scanner/worker.ts`** — Web Worker que recebe catálogo + snapshot + params e devolve as
   linhas. Vite suporta `new Worker(new URL('./worker.ts', import.meta.url), {type:'module'})`
   nativamente. O engine continua importável direto (sem Worker) para os testes e para o
   caminho de 110 receitas do refino, onde o Worker é overhead.

7. **Toda aritmética por `@/lib/money`** (`F09`). Nenhum `Number()` em campo monetário.

## Bibliotecas/dependências

Nenhuma nova. `decimal.js` já está instalado; Worker é nativo do Vite.

## Depende de

Tasks **02** e **03** — catálogo e snapshot.

## Testes automatizados

- Uma receita conhecida com preços conhecidos produz lucro e ROI conferidos **à mão** no teste
  (não contra a própria implementação).
- Receita sem preço de ingrediente devolve linha com `state='missing_ingredient_price'` e
  financeiros nulos — **a linha existe**.
- Os 4 cenários são avaliados e o mais lucrativo vence; um caso onde ordem de compra ganha de
  compra imediata.
- `returnRate` reduz a quantidade a comprar via `calculateIngredientRequirement`, e
  `percentageToRate('36,7')` continua entrando como `0.367` (regressão da task 3.6/01).
- Lucro por peso e por foco: valores conferidos à mão; nulos quando peso/foco ausentes.
- Premium muda só o imposto (4% × 8%) e nada mais.
- **Desempenho**: calcular 5.523 receitas × 1 cidade termina em tempo razoável no ambiente de
  teste — o número medido entra no estado da implementação, não um limite arbitrário no teste.

## Testes manuais

Nenhum nesta task — não há superfície visual ainda. A prova visual vem na task 11.

## Estado da implementação

**Concluída.** `npm run lint` 0 erros (4 warnings pré-existentes) · `npm run typecheck` limpo ·
`npm run test` **218/218 em 49 arquivos** (+14).

- **`src/lib/craft-constants.ts`** — as três taxas saíram de `ranking-projection.ts` para um
  módulo próprio; `ranking-projection.ts` passou a importar de lá. Uma fonte, não três.
- **`src/scanner/prices.ts`** — desfaz o colunar num `Map` por `item|location|quality|ench`.
- **`src/scanner/engine.ts`** — `computeScanner`, composto sobre `craft-formulas.ts` (que até
  aqui nenhuma tela importava). Avalia os 4 cenários e devolve o mais lucrativo.
- **`src/scanner/worker.ts`** — Worker + `runScanner` exportado, para o engine ser testável sem
  Worker e para o refino (110 receitas) poder rodar direto na thread principal.

### Desempenho medido

| | |
|---|---|
| **5.523 receitas × 1 cidade** | **233 ms** |

É a validação da decisão da fase: o catálogo de craft inteiro recalculado em um quarto de
segundo, contra um job de 10 em 10 minutos. O teto do teste é 5 s de propósito — existe para
pegar regressão de ordem de grandeza (um O(n²) entrando sem querer), não para medir a máquina
do CI.

### Guard em vermelho antes da correção

Fazendo o engine filtrar `state !== 'priced'` (o comportamento da arquitetura antiga), três
testes falham com `expected [] to have a length of 1`:

```
× sem preço de ingrediente, a linha existe e diz o motivo
× sem preço de saída, idem
× cidade sem nenhum preço ainda produz linha
```

É o `X01`/`X02` travado na camada de cálculo.

### Uma conta que eu errei, e o motor acertou

O primeiro teste que escrevi esperava custo 400 (compra imediata) e o engine devolveu 369. O
engine estava certo: com `buy=90/180` disponíveis, a ordem de compra sai por 2×90+1×180 = 360
mais `ceil(360×0.025)=9` de taxa = **369**, mais barato que os 400 da compra direta. O teste
virou dois — um forçando o cenário imediato/imediato (sem `buy` nos ingredientes) e outro com
os quatro cenários disponíveis, ambos com a conta escrita no comentário.

### Pendente pra você testar

Nada visual ainda. A paridade com o motor Python é a task 06; a prova na tela é a 11.
