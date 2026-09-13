# 25 — Preço de compra e preço de venda na barra

## Objetivo

A barra de filtros ganha **"Preço de compra"** e **"Preço de venda"**: de onde vem o preço de
**todos** os itens de uma vez, sem abrir linha por linha. O seletor do painel (task 24) continua
existindo, como exceção de um item.

## Por que

Pedido do usuário, depois de usar a task 24:

> Ao invés de atualizar um a um, atualiza todos, igual quando abre um item específico.

Hoje a barra tem um padrão **fixo** para cada lado — a média das cidades de Comprar em na compra, a
melhor cidade de Vender em na venda. Quem quer vender tudo pela média precisa abrir cada linha.

## Decisões já tomadas com o usuário (2026-09-10)

| # | Decisão |
|---|---|
| 1 | **Preço de compra**, embaixo de Comprar em: Média das cidades (padrão) · Menor preço das cidades. |
| 2 | **Preço de venda**, embaixo de Vender em: Melhor cidade (padrão) · Média das cidades. |
| 3 | **Sem cidade específica na barra.** Marcar só uma cidade em Comprar em ou Vender em já dá o mesmo número; as duas coisas juntas permitiriam uma contradição (vender em Martlock com Martlock desmarcada). |
| 4 | **Sem preço fixo na barra.** O mesmo número para todos os itens não é uma pergunta que faça sentido. |
| 5 | **Mudar a barra não apaga as escolhas por item.** A escolha do item é mais específica e continua vencendo. A seção mostra "N itens com preço próprio · limpar" para zerar um lado num clique. |

## Regras

- **Precedência, dos dois lados:** preço fixo do item → origem escolhida no item → **padrão da
  barra**. É a mesma da task 24, com o último degrau deixando de ser fixo.
- **"Menor preço" é por lado.** A oferta mais barata (compra imediata) e a menor ordem de compra
  podem estar em cidades diferentes — são duas compras diferentes, e cada uma acha a sua cidade.
  Só entram as cidades de Comprar em que **têm** preço.
- **Menor preço diz a cidade.** O painel mostra de onde veio o preço do ingrediente; "o mais barato"
  sem dizer onde não serve para ir buscar.
- **No painel, a opção igual à da barra é o padrão.** Escolher ela grava nada na URL; as outras
  continuam como exceção. Com a barra na média da venda, "Melhor cidade" num item vira escolha
  própria (`sc=ITEM:melhor`), e vice-versa.
- **"Melhor cidade" escolhida no item não é uma cidade.** A receita continua avaliada em todas as
  cidades de Vender em, e a melhor vence — só "uma cidade" restringe a avaliação.
- **Venda pela média, da barra ou do item, esconde a análise exata** (`podeAnalisar`, task 24).

## O que implementar

1. **URL.** `ing_price=min` para o menor preço (o `ing_price` já existia: `avg`, `sale`, cidade).
   `sale_price=avg` para a média da venda; ausente = melhor cidade. Na escolha por item, os valores
   `menor` (em `pc`) e `melhor` (em `sc`).
2. **Política (`pricing.ts`).** `PriceBasis` ganha `cheapest`; `PricingPolicy` ganha `saleBase`
   (`best | average`); `Origem` ganha `menor` e `melhor`. `origemPadrao(policy, lado)` traduz a
   barra na língua do seletor do item; `itensComEscolhaPropria(policy, lado)` conta os itens com
   fixo ou origem, uma vez por item. O lado cotado passa a carregar `locationId` quando veio de uma
   cidade só.
3. **Engine.** `baseDaVenda` e `cidadesDeAvaliacao` passam a considerar o padrão da barra e o
   `melhor`. O detalhe do ingrediente carrega a cidade da cotação.
4. **Filtros.** `limparEscolhas(lado)` apaga fixo e origem de um lado numa escrita só.
5. **Painel.** Compra: Média · Menor preço · cidades · Fixar. Venda: Melhor cidade · Média ·
   cidades · Fixar. O ingrediente cotado numa cidade diz qual.
6. **Barra.** Os dois seletores e a linha de "itens com preço próprio".

## Depende de

Task **24** (Comprar em, Vender em e escolha por item).

## Testes automatizados

- Menor preço cota cada lado na cidade mais barata de Comprar em, e diz a cidade.
- A média escolhida no item vence o menor preço da barra.
- Venda pela média na barra vale para item sem escolha, e a linha diz que a base é média.
- "Melhor cidade" no item vence a média da barra e continua avaliando todas as cidades de venda.
- `ing_price=min` e `sale_price=avg` sobrevivem ao F5; mudar a barra troca a política, não o cenário.
- Limpar um lado apaga fixo e origem só daquele lado.
- No painel, a opção igual à da barra publica o padrão; a diferente publica a escolha.

## Testes manuais

1. Na barra, **Preço de venda → Média das cidades**: a coluna Venda de toda linha diz "média de N".
2. Abrir uma linha e escolher **Melhor cidade** na venda: só ela volta a mostrar uma cidade, e a
   barra passa a dizer "1 item com preço próprio".
3. **Preço de compra → Menor preço das cidades**: o painel diz a cidade de cada ingrediente, e ela
   está entre as marcadas em Comprar em.
4. Clicar em **limpar** na linha de itens com preço próprio: as exceções daquele lado somem, as do
   outro lado ficam.

## Estado da implementação

**Concluída.** `npm run test` **465/465** · `typecheck` limpo · `lint` 0 erros (7 avisos, os mesmos
de antes). 21 guards vermelhos primeiro. Os vetores dourados continuam passando sem mudança.

### Três guards que passaram por acaso

No primeiro vermelho, 18 falharam e 3 passaram contra o código antigo:

- **Dois por causa de um import que ainda não existia.** `ORIGEM_MELHOR` chegava `undefined`, a
  escolha do item sumia, e o código antigo caía na cidade da linha — exatamente o valor esperado.
- **Um porque a média escolhida no item já vencia qualquer base**, inclusive uma que o código nem
  conhecia.

Cada um passou a afirmar também o resultado **sem** a escolha do item (o contraste), e os três
ficaram vermelhos antes da implementação.

### O que só apareceu implementando

- **Escolha do outro lado é lixo de URL, não cidade.** `sc=T4_CLOTH:menor` seria lido como uma
  cidade chamada "menor" e zeraria o preço da linha em silêncio. `escolhaDoItem` ignora o valor que
  não existe naquele lado.
- **`saleBase` é opcional na política.** Ausente = melhor cidade, o comportamento de antes; assim
  os vetores dourados e os cenários de teste anteriores não mudaram. O hook da URL sempre preenche.
- **O cache do agregado ganhou o modo na chave** (média ou menor), junto do lado que a task 24 pôs.
- **Empate no menor preço fica com a primeira cidade de Comprar em**, para a cidade mostrada no
  painel não trocar sozinha a cada polling.
- **A cidade aparece em toda cotação de uma cidade só** — menor preço e cidade escolhida —, não só no
  menor. Média e preço fixo continuam sem cidade.
- **Link antigo com `ing_price=<cidade>` ou `sale`** abre com a base dele, e o seletor da barra
  ganha uma opção só para esse caso, para não mostrar "Média" enquanto a conta usa outra coisa.
