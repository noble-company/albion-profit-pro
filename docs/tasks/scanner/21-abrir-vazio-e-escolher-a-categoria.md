# 21 — Abrir vazio e escolher o que analisar

## Objetivo

A tela abre **vazia**, com "Selecione o que você deseja analisar", e o jogador escolhe uma
**categoria** (ou "Top 15 mais lucrativas") antes de qualquer cálculo.

## Por que

Pedido do usuário, e é o que resolve a lentidão do craft — no lugar da paginação pelo Postgres,
que foi avaliada e descartada.

### Por que não paginar no servidor

Ordenar por lucro exige calcular o lucro de **todas** as receitas antes de cortar as 50 primeiras.
O Postgres só pagina por lucro se o servidor calcular o lucro: ou pré-calculado (o ranking
materializado apagado na task 15, com receita sumindo e 10 minutos de atraso), ou a cada pedido
(retorno, estação, foco, Painel do Destino e preço por ingrediente voltando a ser requisição).
Paginar por tier/nome funciona no banco, mas quebra a ordenação por lucro e o Top 15: ordenar as
50 linhas carregadas não é ordenar a lista (achado `F08`).

### O que de fato é lento

Não é baixar dado — o catálogo baixa uma vez e fica em cache (task 07). É **calcular 44 mil
linhas** (5.523 receitas × 8 cidades, 2.703 ms no Worker) e **reconstruí-las** na thread principal
(496 ms). Categoria primeiro corta isso na raiz. Contado no banco:

| Tela | Por categoria |
|---|---|
| Refino | 27 receitas por família (tecido, couro, barras, tábuas); blocos 2 |
| Craft | de 52 a 437 receitas, quase todas perto de 100 |

Extrapolando a medida de 2.703 ms: ~50 ms para 100 receitas, ~200 ms para a maior. E o Worker
devolve só as linhas da categoria, então a reconstrução de 496 ms também encolhe.

No refino (110 receitas, 30 ms) abrir vazio não é por velocidade — é por foco e consistência
entre as duas telas.

## A árvore de categorias

- **Refino:** as famílias vêm de `shop_subcategory2` (`cloth`, `leather`, `metalbars`, `planks`,
  `stoneblock`). `CatalogItemOut` **não expõe** esse campo hoje — entra no contrato.
- **Craft:** `shop_category → shop_subcategory`, com `shop_subcategory2` como terceiro nível onde
  fizer sentido (conjuntos de armadura, tipos de arma).
- **Ordem:** a oficial do mercado do jogo, do bloco `shopcategories` do dump (`@value`): Armas,
  Armaduras, Capacetes, Sapatos, Mão secundária, Capas, Bolsas, Montarias, Consumíveis, Coleta,
  Crafting, Artefatos, Agricultura, Mobília, Vaidade, Outros.
- **Rótulos em português não existem no repositório** — nem no dump, nem em `items.json`. O mapa
  de rótulos é escrito à mão nesta task.
- **Decidir o que esconder:** categorias cujas saídas não são vendáveis ou não interessam ao
  jogador (`other/hardcoreexpeditions`, `other/questitems`, `vanity`…). Listar com contagem antes.

## O que implementar

1. Estado vazio com a chamada "Selecione o que você deseja analisar".
2. Seletor de categoria na barra lateral, na árvore acima.
3. **"Top 15 mais lucrativas"**: calcula a tela inteira (no craft, os 2,7 s de hoje, uma vez, no
   clique, com estado de carregando honesto), ordena por lucro e mostra 15.
4. **Busca por texto também seleciona**: digitar sem categoria calcula as receitas que casam.
5. O engine calcula **só** as receitas selecionadas; o Worker devolve só essas linhas.
6. A escolha vai para a URL (`?cat=…`, `?top=15`) — F5 e link continuam funcionando.

## Depende de

Task **19** e **20**.

## Testes automatizados

- Sem seleção, nada é calculado e a tela mostra a chamada.
- Com categoria, o engine recebe só as receitas dela.
- Top 15 devolve 15 linhas, as de maior lucro da tela inteira.
- A seleção sobrevive a F5 (lida da URL).
- Todo código de categoria que aparece no seletor tem rótulo em português.

## Testes manuais

Abrir `/craft`, escolher Armaduras → Couro e conferir que a tabela aparece rápido; clicar em
Top 15 e conferir o estado de carregando; recarregar a página e conferir que a escolha ficou.

## Estado da implementação

_Não iniciada._
