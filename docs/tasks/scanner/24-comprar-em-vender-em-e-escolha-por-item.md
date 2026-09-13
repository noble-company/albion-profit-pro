# 24 — Comprar em, Vender em, e a escolha por item

## Objetivo

A barra de filtros ganha **"Comprar em"** ao lado do **"Vender em"**, e o painel do item ganha um
**seletor em cada preço** — de cada ingrediente e da venda — para escolher de onde aquele preço
vem: a média das cidades filtradas, uma cidade específica, ou um preço fixo.

## Por que

Pedido do usuário, com o motivo de jogo que decide o desenho:

> Brecilien e Caerleon normalmente têm preços caros pra vender, o que dá muito lucro, mas
> dificilmente vamos levar lá pra vender, porque as zonas ao redor são de PvP, e se a gente morre
> perde tudo no inventário.

O motivo vale para os dois lados: o jogador também não vai buscar fibra onde não vai vender
tecido. Hoje:

- **"Vender em" existe** (task 19, seleção múltipla), mas não há o equivalente para compra.
- **A média dos ingredientes varre todas as cidades**, sempre — decisão da task 11.3 ("filtrar
  onde se vende não pode encolher a base de preço da compra"). O usuário achou que já era só das
  filtradas. **Esta task reverte aquela decisão, por decisão dele (2026-09-10).**
- **A venda só aceita preço fixo**; não dá para dizer "este item eu vendo em Martlock" nem
  "considere a média".
- **A exceção por ingrediente mora num widget da barra lateral**, longe do preço que ela muda.

## Decisões já tomadas com o usuário

| # | Decisão |
|---|---|
| 1 | Duas seleções na barra: **Vender em** (já existe) e **Comprar em** (nova), mesmo formato. Nenhuma marcada = todas. |
| 2 | A **média dos ingredientes** usa só as cidades de **Comprar em**. |
| 3 | No painel, **seletor por ingrediente**: média das cidades de compra · uma cidade · fixar preço. |
| 4 | No painel, **seletor na venda**: melhor cidade (o de hoje) · média das cidades de venda · uma cidade · fixar preço. |
| 5 | O widget "Preço dos ingredientes" (exceções por item) sai da barra: o painel faz o mesmo, junto do preço. |

## Regras

- **A escolha no painel vale por item, não por receita** — a regra da 11.3. Marcar Fort Sterling
  na Fibra T5 dentro de uma receita muda a Fibra T5 em toda receita que a usa. Na venda, vale para
  aquele item de saída.
- **A escolha específica vence o filtro.** Um item com cidade escolhida no painel é cotado nela
  mesmo que ela esteja desmarcada na barra: é a escolha mais explícita que existe na tela.
- **Precedência:** preço fixo → escolha do item (cidade ou média) → padrão da barra.
- **Venda pela média não tem cidade.** A célula de Venda diz "média de N cidades", e a linha não
  pode fingir um mercado.

## O que implementar

1. **URL.** `buy_in` em parâmetro repetido, como `sell_in`. Escolha por item:
   `pc=ITEM:<cidade|media>` para ingrediente (o `pc` de hoje, que só aceitava cidade) e
   `sc=ITEM:<cidade|media>` para a venda (novo). `px` e `sx` continuam para o preço fixo.
2. **Engine.**
   - A média de ingrediente usa as cidades de Comprar em (`priceLocations`).
   - Item de saída com cidade escolhida é avaliado **só naquela cidade**.
   - Item de saída com média usa a média das cidades de Vender em — **na qualidade da saída**.
     Hoje `media()` fixa qualidade 1, o que está certo para ingrediente e errado para venda.
   - A linha carrega a base da venda (`cidade | média | fixo`), para a célula não mostrar uma
     cidade que não houve.
3. **Painel.** Um seletor compacto ao lado de cada preço; "fixar preço…" abre o campo de hoje.
4. **Barra.** Chips de Comprar em; sai o widget de exceções.

## Pontos a decidir antes de implementar

- **O seletor "Base" dos ingredientes** (média / cidade da venda / cidade) fica redundante com
  Comprar em, exceto pela opção "cidade da venda". Manter essa opção ou tirar o seletor.
- **"Analisar com o livro real" com venda pela média.** O livro de ordens é por mercado; não há um
  para a média. Esconder o botão com a explicação, ou analisar numa cidade escolhida.

## Depende de

Task **11.3** (política de preço), **19** (Vender em) e **20** (painel e célula de Venda).

## Testes automatizados

- A média de ingrediente usa só as cidades de Comprar em; nenhuma marcada = todas.
- Ingrediente com cidade escolhida é cotado nela mesmo fora do filtro.
- Saída com cidade escolhida gera linha só naquela cidade.
- Saída pela média usa a qualidade da saída, e a linha diz que a base é média.
- Preço fixo continua vencendo tudo, nos dois lados.
- `buy_in`, `pc=…:media` e `sc=…` sobrevivem ao F5.
- Link antigo com `pc=ITEM:cidade` continua funcionando.

## Testes manuais

Desmarcar Brecilien e Caerleon em Comprar em e em Vender em e conferir que nenhum preço vem de lá;
abrir um item, escolher uma cidade específica para um ingrediente e conferir que as outras receitas
com o mesmo ingrediente mudaram junto.

## Estado da implementação

**Concluída.** `npm run test` **445/445** · `typecheck` limpo · `lint` 0 erros (7 avisos, os mesmos
de antes). Guards vermelhos primeiro. Os vetores dourados continuam na suíte: a paridade com o
`simulate_craft` não mudou.

### Os pontos que estavam em aberto

- **O seletor "Base" saiu da tela; o modo "cidade da venda" ficou no motor.** Ele é a configuração
  dos vetores dourados — seis arquivos de teste usam esse modo, porque é assim que o servidor cota
  no `simulate_craft`. Tirar do motor quebraria a trava da task 06. Link antigo com
  `ing_price=<cidade>` continua sendo lido.
- **"Analisar com o livro real" fica escondido na venda pela média**, com a frase "a análise exata
  precisa de uma cidade de venda". O livro de ordens é por mercado; a média não é um. Com preço
  fixo o botão continua: a análise leva o preço declarado. A regra é `podeAnalisar`, em `tela.ts`.

### O que só apareceu implementando

- **A troca de origem precisava ser atômica.** Escolher uma cidade tem que apagar o preço fixo do
  mesmo item. Duas chamadas de `setExcecao` seguidas leriam o mesmo `params` antigo e a segunda
  desfaria a primeira — a cidade entraria e o preço fixo continuaria vencendo. `definirOrigem`
  mexe nas duas chaves do lado numa escrita só.
- **A média da venda estava na qualidade errada.** `media()` fixava qualidade 1, o que é certo para
  ingrediente. A venda cota a qualidade pedida; o teste arma a armadilha com a qualidade 1 custando
  50 e a 2 custando 1.000.
- **O cache da média precisou separar os lados.** Um item pode ser saída de uma receita e
  ingrediente de outra (tecido T4, por exemplo), e as duas médias varrem conjuntos diferentes —
  Vender em e Comprar em. A chave do cache ganhou o lado.
- **Cidade escolhida para a venda avalia só ela**, mesmo desmarcada em Vender em. Média e preço
  fixo continuam avaliando todas as cidades de venda: a venda empata, e a linha diz a base em vez
  de fingir uma cidade — na célula de Venda e no destaque da tabela de cidades do painel.
- **Na compra, "Média das cidades de compra" é o próprio padrão**, então a opção escreve o padrão
  (URL limpa) em vez de `pc=ITEM:media`. O `media` explícito continua aceito na URL.
- `IngredientPrices.tsx` foi apagado, junto com a lista de ingredientes que só ele usava.

### Um guard que passou contra o código antigo

"Preço fixo vence a cidade escolhida" passou antes da implementação: o preço fixo já vencia tudo.
Ele fica como trava da precedência daqui para frente, não como prova desta task. Os testes antigos
do painel também falharam no vermelho, mas por outro motivo — o arquivo reescrito passava as props
novas ao componente antigo.

### Pendente pra você testar

1. Na barra, desmarcar Brecilien e Caerleon em **Vender em** e em **Comprar em**, e conferir no
   painel de uma linha que nenhum preço vem de lá.
2. Num item, escolher uma cidade específica para um ingrediente e conferir que outra receita com o
   mesmo ingrediente mudou junto.
3. Na venda, escolher **Média das cidades de venda**: a coluna Venda diz "média de N", e o botão
   de análise dá lugar à explicação.
4. Escolher **Fixar preço…**, aplicar, depois escolher uma cidade: o preço fixo tem que sumir.
