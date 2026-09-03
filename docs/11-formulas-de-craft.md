# Contrato e fórmulas de craft

Este documento fixa a semântica financeira usada pela calculadora. Ele é o contrato das Tasks 04,
05, 14 e 15 da Fase 3; valores observados no jogo ainda precisam ser confrontados no gate da Task
19. As implementações puras correspondentes ficam em `backend/src/craft/formulas.py`.

## Convenções numéricas

- Dinheiro e taxas usam `Decimal`; `float` não participa do cálculo.
- Taxas são frações: `0.04` significa 4%.
- Quantidades esperadas podem ser decimais. Quantidades efetivamente compráveis são inteiras e
  usam teto.
- Cada cobrança percentual em silver é arredondada separadamente para cima: `ceil(base × taxa)`.
  Não se somam imposto e setup antes do arredondamento.
- Os defaults configuráveis, confirmados pelo responsável do produto em 2026-08-23, são imposto de
  venda de 4% com Premium, 8% sem Premium e setup fee de 2,5% nos dois casos. Request/UI podem
  sobrescrevê-los.
- Taxa de retorno e custo de estação são sempre escolhas do jogador, não defaults inferidos.
- O cálculo interno preserva toda a precisão em `Decimal`. A apresentação pode mostrar no máximo
  uma casa decimal, arredondando para baixo (`2,525 → 2,5`; `-2,525 → -2,6`) e removendo zero
  decimal desnecessário. Esse valor de apresentação nunca volta para as fórmulas nem decide um
  limite de ROI.

## Produção e ingredientes

Para quantidade desejada `Q` e rendimento `amount_crafted = A`:

```text
execucoes = ceil(Q / A)
quantidade_produzida = execucoes × A
sobra_produzida = quantidade_produzida - Q
```

`Q` e `A` são inteiros positivos. A receita e o lucro consideram toda a quantidade realmente
produzida, inclusive a sobra, pois ela permanece vendável. A resposta deve expor a sobra para que
a UI não dê a impressão de que exatamente `Q` unidades foram produzidas.

Para um ingrediente com `count = C`, taxa de retorno `R` e `E` execuções:

```text
quantidade_bruta = C × E
retorno_esperado = quantidade_bruta × R
quantidade_efetiva_esperada = quantidade_bruta - retorno_esperado
quantidade_a_comprar = ceil(quantidade_efetiva_esperada)
```

`R` é um input do jogador no intervalo inclusivo de 0 a 1. O retorno inteiro utilizável é
conservador (para baixo), enquanto `quantidade_a_comprar` usa teto. Os valores esperados continuam
em `Decimal` para evitar arredondamento intermediário acumulado. Como a quantidade bruta é
inteira, `ceil(bruta - retorno_esperado)` equivale a descontar apenas `floor(retorno_esperado)`.

Ingredientes que não participam do retorno precisam vir marcados por uma regra explícita e
validada. Para eles, aplica-se `R = 0`. Não é permitido decidir isso somente procurando substrings
como `ARTEFACT` no identificador do item.

## Foco

```text
foco_consumido = crafting_focus × execucoes, se usar_foco
foco_consumido = 0, caso contrário
```

`usar_foco` não altera nem inventa uma taxa de retorno. O jogador fornece `R` separadamente, já
considerando cidade, especialização, bônus e foco conforme sua situação no jogo.

## Componentes de custo de craft

Os componentes permanecem separados no breakdown:

1. custo dos ingredientes, conforme a modalidade de aquisição;
2. `Recipe.silver_cost × execucoes`, que representa somente o `@silver` do dump;
3. custo de estação por execução informado pelo jogador × execuções;
4. custo dos recursos de upgrade, quando a rota escolhida os usa;
5. setup fee de aquisição, somente em buy order.

`Recipe.silver_cost` não é sinônimo da taxa que a estação mostra por 100 de nutrição. O dump não
documenta a eventual cobrança em silver de uma rota de upgrade. Portanto, nem a taxa da estação
nem uma taxa de upgrade ausente podem ser deduzidas de `@silver`.

```text
custo_total = ingredientes + recipe_silver + estacao + upgrades + setup_de_compra
```

Cada componente desconhecido propaga resultado financeiro `null`; preço ausente nunca vira zero.

## Aquisição, venda e quatro cenários

As modalidades são independentes e formam quatro combinações:

| Aquisição | Venda | Cotação | Cobranças |
|---|---|---|---|
| imediata | imediata | consome asks e bids do livro | imposto na venda |
| imediata | sell order | compra consome asks; venda usa preço-alvo | setup + imposto na venda |
| buy order | imediata | compra usa preço-alvo; venda consome bids | setup na compra; imposto na venda |
| buy order | sell order | ambos usam preços-alvo | setup na compra; setup + imposto na venda |

Compra imediata consome asks em preço crescente. Venda imediata consome bids em preço decrescente.
O custo/receita é a soma dos níveis efetivamente preenchidos, preservando slippage e cobertura
parcial. Buy/sell orders usam preço-alvo, não garantem execução e devem carregar aviso próprio.

Para custo cotado de compra `B`, receita bruta `V`, setup `S` e imposto `T`:

```text
setup_compra = ceil(B × S), somente em buy order
custo_aquisicao = B + setup_compra

setup_venda = ceil(V × S), somente em sell order
imposto_venda = ceil(V × T), em venda imediata e sell order
receita_liquida = V - setup_venda - imposto_venda
```

Premium escolhe apenas o default de `T`; não reduz `S` pela metade. Todos os percentuais continuam
editáveis.

## Resultado financeiro

```text
lucro = receita_liquida - custo_total
lucro_por_unidade = lucro / quantidade_produzida
ROI = lucro / custo_total
```

ROI é `null` quando `custo_total = 0`. ROI é uma razão (`0.25` equivale a 25%), não uma porcentagem
pré-multiplicada por 100. Margem seria `lucro / receita_liquida`; se adicionada no futuro, precisa
ter nome e campo próprios e não pode substituir ROI.

Materiais compráveis, custos e cobranças são arredondados na direção conservadora (para cima);
retorno utilizável é arredondado para baixo. Receita, lucro e ROI permanecem exatos internamente e
só são arredondados para baixo, com uma casa decimal, na apresentação. Portanto, um filtro como
“ROI mínimo de 10%” compara o valor interno conservador com `0.10`, nunca o texto já formatado.

## Contrato de resultado nas oportunidades (`B04`)

`/opportunities/flips`, `/opportunities/refining` e `/opportunities/crafting` devolvem o resultado
financeiro com **os mesmos campos e o mesmo significado** de `craft/schemas.py`
(`RevenueBreakdownOut` / `CostBreakdownOut`). `gross_revenue` é **sempre** o faturamento bruto —
nunca o líquido. Identidades garantidas por teste nos três endpoints:

```text
gross_revenue - sales_tax - sale_setup_fee = net_revenue
total_fees = sales_tax + sale_setup_fee + acquisition_setup_fee
net_revenue - total_cost = profit
roi = round(profit / total_cost * 100, 4)   (null quando total_cost = 0)
```

- `sales_tax` = `ceil(gross_revenue * aliquota)` — 4% com Premium, 8% sem (`craft/constants.py`).
- `sale_setup_fee` = `ceil(gross_revenue * 0,025)` quando a venda é por ordem (`sell_order`), senão 0.
- `acquisition_setup_fee` = `ceil(custo_de_aquisicao * 0,025)` quando a compra é por ordem
  (`buy_order`), senão 0. Já está incluído em `total_cost`.
- `total_fees` existe para a UI **não** deduzir as taxas por engenharia reversa (era o `F09`).
- Todo campo monetário viaja como string decimal, nunca número JSON.

`require_complete` tem **uma** semântica nos três: descarta a linha se ela tiver qualquer aviso
(`warnings` não vazio) ou não estiver precificada. No flip, cujo único aviso possível é
`dado_velho`, isso equivale a "somente dados frescos".

O ranking de refino/craft (`neutral_ranking`) devolve esses campos como **projeção** dos
componentes neutros armazenados; `return_rate` entra como aproximação linear. O recálculo exato,
com profundidade de livro real, é `POST /craft/simulate`.

## Encantamento e upgrade

Para um output `.N`, a rota de upgrade é uma cadeia ordenada:

```text
.0 -> .1 -> .2 -> ... -> .N
```

Cada elo usa o `upgrade_resource_*` armazenado na receita do nível de destino. Não é correto somar
somente o recurso do nível final. Se faltar receita, recurso, quantidade ou preço em qualquer elo,
a rota inteira fica indisponível com motivo explícito; a lacuna não vale custo zero. Craft direto
encantado e compra do item pronto são rotas distintas da cadeia de upgrade.

## Exemplo controlado: T2 Fiber para T2 Cloth

Este exemplo valida as fórmulas, não os valores atuais do jogo. Entradas: produzir 10 `T2_CLOTH`;
`amount_crafted = 1`; 1 `T2_FIBER` por execução; retorno informado de 15%; foco 18 por execução;
estação 3 silver por execução; fibra imediata 100, buy order 90 e cloth 150 por unidade; Premium.

```text
execucoes = 10; produzido = 10; sobra = 0
fibra bruta = 10; retorno esperado = 1.50; efetivo = 8.50; comprar = 9
foco consumido = 18 × 10 = 180
recipe_silver = 0; estacao = 3 × 10 = 30

compra imediata: 9 × 100 = 900; custo total = 900 + 30 = 930
buy order: 9 × 90 = 810; setup = ceil(810 × 0.025) = 21; custo total = 861

venda imediata: bruto = 1,500; imposto = 60; liquido = 1,440
sell order: setup = ceil(1,500 × 0.025) = 38; imposto = 60; liquido = 1,402
```

Resultados dos quatro cenários:

| Aquisição | Venda | Lucro | Lucro/unidade | ROI |
|---|---|---:|---:|---:|
| imediata | imediata | 510 | 51 | 0.548387... |
| imediata | sell order | 472 | 47.2 | 0.507526... |
| buy order | imediata | 579 | 57.9 | 0.672473... |
| buy order | sell order | 541 | 54.1 | 0.628339... |

Na Task 19 serão conferidos o fluxo integrado, os preços ao vivo e a correspondência da cobrança
observada com o breakdown. Os percentuais padrão acima já são decisões confirmadas; retorno e
estação permanecem inputs do jogador.
