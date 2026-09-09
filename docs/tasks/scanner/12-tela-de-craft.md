# 12 — Tela de Craft: o scanner na escala real

## Objetivo

`/craft` sai do ranking materializado e passa a usar o motor do cliente, como o refino já usa.

## Por que

O refino provou a arquitetura em 110 receitas. O craft são **5.523** — e é onde as três decisões
da fase param de ser teoria:

- **A escala.** Medido agora, com o catálogo sintético de 5.523 receitas × 8 cidades:
  `computeScanner` leva **2.583 ms**. Na thread principal isso é a interface congelada por dois
  segundos e meio a cada mudança de cenário. O Worker que a task 05 escreveu e nenhuma tela usa
  existe exatamente para isto.
- **A forma da receita.** O refino tem 2 ingredientes em 105 das 110 receitas, e por isso as
  colunas fixas `Ingrediente 1/2` funcionam. O craft tem **de 1 a 4**, variados — o formato não
  serve, e isso já estava anotado na 11.2.
- **A dependência da 15.** `/craft` é o último consumidor de `recipe_ranking`. Enquanto ele
  existir, a tabela, o job e o beat de 10 minutos não podem ser apagados.

## O que implementar

1. **Worker de verdade** — `computeScanner` sai da thread principal para o craft.
2. **Serialização à prova de esquecimento** — `Money` é `Decimal` e não atravessa
   `postMessage`. Hoje `SerializedScannerRow` é uma lista escrita à mão, e **já está
   desatualizada**: não tem `averageUnitCost` (11.2.3) nem `ingredients` (11.2). O formato tem
   que ser derivado do tipo, não repetido à mão.
3. **Colunas do craft** — resumo de ingredientes numa coluna só, com o detalhe completo já
   existindo no painel expandido.
4. **`/craft` aponta para o scanner.**

## Depende de

Task **11** (o scanner) e **05** (o Worker). Destrava a **15**.

## Testes automatizados

- A serialização não perde campo: o tipo serializado é derivado de `ScannerRow`, então um campo
  novo quebra a compilação em vez de sumir em silêncio.
- Ida e volta pelo Worker preserva os valores string a string (`F09`).
- Resposta velha é descartada: dois cálculos em voo, só o último pinta a tela.
- A coluna de ingredientes do craft resume 1 a 4 ingredientes sem cortar a quantidade.

## Testes manuais

Abrir `/craft`, mexer no retorno de recurso e confirmar que a tela não trava; conferir uma
receita conhecida contra o jogo.

## Estado da implementação

**Concluída.** `npm run test` **381/381** (+11) · `typecheck` limpo · `lint` 0 erros ·
`vite build` emite o chunk `worker-*.js`. Guards vermelhos primeiro.

### A medida que decidiu o desenho

Catálogo sintético de 5.523 receitas × 8 cidades, com 3 ingredientes por receita:

```
computeScanner: 2.583 ms
bestPerRecipe:      9 ms  → 5.523 linhas
```

Dois segundos e meio **a cada** mudança de cenário. Foi o que tirou o Worker de "otimização
possível" para "requisito".

### A serialização deixou de ser uma lista à mão

`Money` é `Decimal` e não atravessa `postMessage` — o `structuredClone` copia as propriedades e
**perde o protótipo**, então do outro lado chegaria um objeto sem `.plus()`.

A primeira versão do worker listava os campos manualmente e **já estava desatualizada**:
`averageUnitCost` (11.2.3) e `ingredients` (11.2) entraram depois e não estavam lá. Uma linha
chegaria à tela com a lista de compras vazia e o custo por item nulo, sem erro em lugar nenhum.

Agora o formato é um **tipo mapeado** sobre `ScannerRow`. Verificado apagando um campo do
serializador: `error TS2322: Type ... is not assignable to type 'MoneyParaString<ScannerRow>'`.
Campo novo em `ScannerRow` quebra a compilação em vez de sumir em silêncio.

### O protocolo tem duas mensagens

`data` (catálogo + snapshot + mapeamento de cidades) chega quando o dado muda — raramente — e é
onde o índice de preços é construído, uma vez. `compute` chega a cada mudança de cenário e leva
**só os parâmetros**. Reenviar 5.523 receitas a cada tecla custaria mais que o cálculo.

O mapeamento de cidades entra por **conteúdo** e não por identidade: ele é derivado de uma lista
e ganharia referência nova a cada render, reenviando o catálogo por nada.

### Resposta velha é descartada

Com 2,5 s de cálculo, dois pedidos ficam em voo enquanto o jogador digita, e a ordem de chegada
não é garantida. Cada `compute` leva um `id`; só a resposta do último pinta a tela. O teste
simula a chegada fora de ordem com um dublê — é a variável que importa, e o Worker real não
existe em jsdom.

### Colunas do craft

O refino tem 2 ingredientes em 105 das 110 receitas, e as colunas `Ingrediente 1/2` funcionam
lá. O craft tem de 1 a 4: um par de colunas por ingrediente daria **oito colunas** para mostrar
quatro números, quase sempre vazias. Viraram duas — `Ingredientes` (resumo) e `Investimento`
(soma) —, com o detalhe completo já existindo no painel expandido.

O `Investimento` **soma só o que tem preço e avisa**: um asterisco vermelho com quantos
ingredientes faltam. Somar parcial em silêncio seria um total que parece completo.

### Detalhes que só aparecem usando

- **O refino não paga pelo Worker.** Ele chama o hook com `null` e nenhuma thread é criada —
  110 receitas levam ~30 ms e a latência de mensagem seria pior que o cálculo.
- `src/test/code-splitting.test.ts` trocou `production-pages` por `./scanner/ScannerPage` no
  roster: nenhuma rota aponta mais para a tela antiga.

### Pendente pra você testar

1. `/craft` abre com as 5.523 receitas e a coluna `Ingredientes` resumindo.
2. Mexer no retorno de recurso ou na quantidade **não trava a tela** — deve aparecer o estado de
   carregando por um instante, e não um congelamento.
3. Conferir uma receita conhecida contra o jogo.

### Destrava a 15

`/craft` era o último consumidor de `recipe_ranking`. A tabela, o job, o beat de 10 minutos e a
tela antiga podem ser apagados agora.

## Correção: recálculo em todo filtro (2026-09-09)

Reportado logo no primeiro uso: "está demorando muito pra carregar toda vez que faço alguma
alteração nos filtros".

### A causa

`scenario`, `pricing` e `strategy` memoizavam em `[params]` — e `URLSearchParams` **ganha
identidade nova a cada mudança de URL**. Digitar uma letra na busca criava objetos novos, que
mudavam `paramsDoEngine`, que disparava o Worker: **2,5 s recalculando 5.523 receitas para
esconder linhas que já estavam calculadas**.

O filtro de exibição nunca precisou de recálculo. Ele mexe em `applyFilters`, que roda sobre o
resultado — medido agora: **38 ms para filtrar e ordenar 44.184 linhas**. O custo estava todo no
recálculo desnecessário.

### A correção

Cada memo passa a depender de uma **chave de conteúdo** dos parâmetros que ele de fato lê
(`chaveDe(params, ['qty', 'return_rate', …])`), não da referência do `URLSearchParams`.

O mesmo defeito estava em `useDestinyBoard`, que devolvia `new Map()` a cada render enquanto o
painel carregava — identidade nova, recálculo novo. Agora é uma constante.

### O guard

`filtro de EXIBIÇÃO não troca a identidade do que alimenta o engine`: digita na busca e compara
as **referências** de `scenario`, `pricing` e `strategy`. Junto dele, o par que impede o guard de
ser vazio: mexer no cenário **troca** a identidade (aí recalcular é o certo), e o filtro de fato
mudou.

Este é o tipo de defeito que nenhum teste de comportamento pega — a tela mostra os números
certos, só demora 2,5 s para isso. Só aparece medindo identidade.

## Correção: a tela travava sozinha, a cada 30 segundos (2026-09-09)

Reportado como "ainda travando" depois da correção acima. Não era a mesma causa.

### A medida

Ciclo completo do craft, 5.523 receitas × 8 cidades = 44.184 linhas:

```
compute = 2.703 ms   (Worker)
serialize =  157 ms   (Worker)
revive  =   496 ms   (THREAD PRINCIPAL)
```

O Worker tirou os 2,7 s da thread principal, mas deixou **496 ms** nela: `reviveRow`
reconstrói os `Decimal` de 44 mil linhas do outro lado do `postMessage`. Meio segundo de
congelamento real, no fim de cada cálculo.

### A causa: o carimbo, não o preço

O polling de 30 s do snapshot (task 11.2.2) fica — ele existe para a captura do jogo aparecer
na tela. O que não podia ficar era o efeito colateral dele.

`GET /prices/snapshot` carimba `generated_at = datetime.now(UTC)` em **toda** resposta
(`prices/router.py`). A igualdade estrutural padrão do TanStack Query compara a resposta
inteira, então esse carimbo sozinho bastava para o snapshot ganhar identidade nova a cada meio
minuto — **com o mercado inteiramente parado**. Identidade nova reenviava o catálogo ao Worker
e disparava o ciclo completo: 2,7 s de cálculo mais 496 ms de thread principal travada.

A cada 30 segundos, sem ninguém tocar em nada.

É o mesmo defeito da correção anterior (`URLSearchParams` com identidade nova a cada mudança de
URL), numa fronteira diferente: **identidade trocando sem o conteúdo ter mudado**.

### A correção

`structuralSharing` própria: a identidade do snapshot segue os **preços** — dicionários,
`row_count` e as dez colunas —, não o carimbo. Preço que se move continua trocando a
identidade, e aí recalcular é o certo.

E `estadoDaTela` separa **recalcular de carregar**. A tela tratava os dois como a mesma coisa e
trocava a tabela inteira pelo `Carregando` a cada recálculo: a rolagem voltava ao topo, a linha
aberta fechava, e por 2,7 s não havia nada na tela. Agora só a primeira carga esconde a tabela;
depois dela as linhas do cenário anterior ficam, com um `recalculando…` no cabeçalho. A exceção
é a primeira conta do craft, que continua escondendo — mostrar a tabela vazia ali escreveria
"0 linhas", que é uma afirmação sobre o mercado que uma conta inacabada não autoriza.

### Os guards

- `mercado parado: o polling NÃO troca a identidade do snapshot` — vermelho verificado
  desligando a `structuralSharing`. O par (`preço que se move TROCA a identidade`) fica verde
  nos dois mundos, provando que a correção não passa do ponto.
- `recálculo COM linhas na tela mantém a tabela`, com `a PRIMEIRA conta do craft ainda esconde`
  ao lado.

O teste de identidade custou três versões erradas antes de valer: a primeira passava por não
ter feito nada (o refetch ficava preso no timer falso), a segunda indexava a resposta por
contagem de pedidos e entregava a errada, e a terceira lia o estado antes da resposta assentar.
O sync point que funciona é `dataUpdatedAt` — ele avança em toda resposta, inclusive quando o
objeto de dados é, de propósito, o mesmo.

### O que sobra

Os **496 ms de revive** continuam lá, agora só quando o cálculo é de verdade (mudança de
cenário, ou preço que se moveu) em vez de a cada 30 s. Baixar isso significa parar de reviver
44 mil linhas para mostrar trinta — as linhas ficariam serializadas e só a janela visível
viraria `Decimal`. Não está feito, e `sortRows`/`applyFilters` teriam que mudar junto.
