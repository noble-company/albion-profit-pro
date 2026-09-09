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
