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
- **Craft:** `shop_category → shop_subcategory`, dois níveis. O terceiro ficou de fora: por
  subcategoria o maior recorte já é de 430 receitas (Artefatos › Armas).
- **Ordem:** a oficial do mercado do jogo, do bloco `shopcategories` do dump (`@value`): Armas,
  Armaduras, Capacetes, Sapatos, Mão secundária, Capas, Bolsas, Montarias, Consumíveis, Coleta,
  Crafting, Artefatos, Agricultura, Mobília, Vaidade, Outros.
- **Rótulos em português** não existem no dump nem em `items.json`. `i18n/categories.ts` (Fase
  3.5) cobria só as categorias e parte das armas; esta task completa o mapa por código inteiro.
- **O que esconder** — decidido pelo **nome**, não pela categoria: ver o estado da implementação.

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

**Concluída.** Frontend `npm run test` **485/485** · `typecheck` limpo · `lint` 0 erros (7 avisos,
os mesmos de antes). Backend `tests/catalog` **17/17** · `ruff` limpo. Guards vermelhos primeiro:
6 no frontend, 1 no backend, e o `categorias.test.ts` inteiro falhando por não haver o módulo.

### O que a validação contra o banco mudou na spec

- **Os rótulos já existiam em parte.** A spec dizia que não havia nenhum em português no repositório;
  havia `i18n/categories.ts`, que monta o rótulo pedaço a pedaço (`cloth_armor` → "Cloth · Armor").
  O mapa novo, `rotuloDeCategoria`, é por código inteiro e devolve `undefined` quando não sabe —
  o teste exige rótulo para todo código do bloco `shopcategories` do dump. Os nomes do topo seguem
  os que o arquivo já usava: Cabeça, Calçados, Fabricação, Cultivo, Cosméticos.
- **Esconder pelo nome, não pela categoria** (decisão do usuário, 2026-09-10). Contado no banco:
  `capes/other` tem 54 capas `UNIQUE_` e 9 capas de facção normais; esconder a subcategoria perderia
  as nove. A regra (`receitaEscondida`) tira o que começa com `UNIQUE_` ou `QUESTITEM_` ou termina em
  `_NONTRADABLE`, e vale na árvore, no Top e na busca. Os 39 tokens de dungeon sem categoria vão
  para Outros.
- **Contagem real por subcategoria:** de 1 (runas) a 430 (Artefatos › Armas); armas e armaduras
  perto de 100, comida 207, poções 162. Categoria inteira também pode ser escolhida
  (subcategoria "Todas").

### O que só apareceu implementando

- **A lista de receitas entra no engine pelo conteúdo.** Com uma categoria escolhida, digitar na
  busca refaz a seleção com as mesmas receitas; uma lista de identidade nova faria o Worker
  recalcular a cada tecla.
- **A seleção viaja na mensagem `compute`, não no catálogo.** Mudar a categoria não reenvia as 5.523
  receitas ao Worker nem reconstrói o índice de preços. Lista vazia calcula nada — o Worker continua
  vivo na tela vazia, e a primeira escolha não paga a criação da thread.
- **O Top 15 vem depois dos filtros da barra:** marcar T6 pede as 15 melhores de T6. Abre ordenado
  por lucro, inclusive depois de um F5.
- **O filtro `category` antigo saiu.** Ele lia `?category=` da URL, mas nenhum controle escrevia.
- **`schema.d.ts` regenerado sem subir servidor.** A API local não recarregou o código; o OpenAPI
  saiu de `app.openapi()` e passou pelo mesmo `openapiTS`/`astToString` de `scripts/api-types.mjs`.
  O diff é só o campo novo.
- **Sem teste da página.** A suíte não tem mock de catálogo nem de snapshot; "sem seleção, nada é
  calculado" está travado em `receitasDaSelecao` (modo `nada`, lista vazia) e no engine (lista vazia,
  nenhuma linha).
- Os E2E de `/refino` já descreviam a tela apagada na task 15 e continuam para a reescrita do fim do
  Bloco 3.

### Pendente pra você testar

1. Abrir `/craft`: a tela mostra "Selecione o que você deseja analisar" e nenhuma linha.
2. Escolher **Armaduras → Couro**: a tabela aparece rápido, só com armaduras de couro.
3. Clicar em **Top 15 mais lucrativas**: aparece "Calculando 5.xxx receitas…", e depois 15 linhas
   ordenadas por lucro. Marcar T6 e conferir que continuam 15, todas T6.
4. Recarregar a página (F5) e conferir que a escolha ficou.
5. Sem categoria nem Top, buscar "espada": calcula só as espadas; com "es" não calcula nada.
6. Em `/refino`, conferir as famílias Tecido, Couro, Barras de metal, Blocos de pedra e Tábuas.
