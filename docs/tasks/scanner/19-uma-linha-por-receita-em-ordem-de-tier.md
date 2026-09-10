# 19 — Uma linha por receita, em ordem de tier

## Objetivo

A tabela do scanner abre em **ordem de tier → encantamento → nome**, uma linha por receita, e o
modo "Todas (comparar lado a lado)" deixa de existir.

## Por que

Pedido do usuário, com o app de referência dele (Albion VIP) aberto do lado: a lista se lê como o
mercado do jogo — `Couro Esticado T2`, `Couro Grosso T3`, `Couro Trabalhado T4.0`, `T4.1`, `T4.2`… —
e não como um ranking que embaralha a família inteira pelo lucro.

Duas coisas atrapalhavam essa leitura:

- **A ordem padrão era lucro.** Ótima para "o que vale mais", ruim para achar um item conhecido
  e comparar os níveis de encantamento de uma mesma família lado a lado.
- **O modo "Todas as cidades"** multiplica cada receita por 8 linhas. A comparação entre cidades
  já existe no painel expandido (task 11.4, "preço por cidade"), onde ela não ocupa a tabela.

## O que implementar

1. **Campo de ordenação `tier`.** Ordena por tier, depois encantamento, depois nome exibido. A
   linha do engine passa a carregar `tier` e `enchantmentLevel` da saída, para a ordenação ser
   uma função pura da linha — sem consultar o catálogo no meio do `sort`.
2. **`DEFAULT_SORT` vira `{ field: 'tier', direction: 'asc' }`.** Clicar em Lucro, ROI etc.
   continua ordenando por eles.
3. **Linha sem preço mantém a posição na ordem estrutural.** Hoje ela vai sempre para o fim, e
   isso está certo para lucro (ausência não é "lucro zero"). Mas em ordem de tier ou de nome a
   posição não depende de preço: mandar `Couro T4.2` sem cotação para depois do T8 quebraria
   exatamente a leitura que esta task existe para dar. Ausência vai para o fim **só** quando o
   campo ordenado é um número calculado.
4. **Remover o modo `sell_in=all`.** Sai a opção do seletor "Vender em", os chips de cidade que
   só existiam nele, e o filtro `locations` que só valia nele (`filtrosEfetivos` existia para
   neutralizá-lo nos outros modos). `?sell_in=all` de link antigo cai em `best` — link velho
   continua abrindo, com uma linha por receita.

## Depende de

Task **11** (a tela) e **11.4** (o painel, onde a comparação entre cidades continua).

## Testes automatizados

- Ordem de tier: T2 < T3 < T4.0 < T4.1 < T4.2 < T5, com nome desempatando o mesmo tier.encanto.
- Linha sem preço fica na posição do tier dela quando a ordenação é por tier; continua indo para
  o fim quando a ordenação é por lucro.
- A ordenação padrão é tier crescente.
- `?sell_in=all` é lido como `best`.

## Testes manuais

Abrir `/refino` sem parâmetros e conferir a família de couro na ordem T2 → T8 com os encantamentos
em sequência; clicar em Lucro e conferir que a ordem muda; abrir um link antigo com
`?sell_in=all` e conferir uma linha por receita.

## Estado da implementação

**Concluída.** `npm run test` **390/390** · `typecheck` limpo · `lint` 0 erros. Guards vermelhos
primeiro.

### A ordem, com o dado real

Nenhuma receita sem tier no banco (0 de 110 no refino, 0 de 5.484 no craft). A família de couro
do refino sai assim — a mesma sequência do app de referência:

```
T2.0 Couro Esticado
T3.0 Couro Grosso
T4.0 Couro Trabalhado
T4.1 Couro Trabalhado Incomum
T4.2 Couro Trabalhado Raro
T4.3 Couro Trabalhado Excepcional
T4.4 Couro Trabalhado Prístino
T5.0 Couro Curtido
…
```

### Decisões que saíram da leitura do código

- **A linha carrega `tier` e `enchantmentLevel`.** A ordenação vira função pura da linha, sem
  consultar o catálogo no meio do `sort`. O Worker não precisou de mudança: `serializeRow` e
  `reviveRow` usam spread, e o tipo mapeado mantém número como número.
- **Nome exibido desempata, não o código.** `sortRows` recebe um resolvedor de nome opcional;
  a tela passa `nomeItem`. "Ordem alfabética" é a do nome que o jogador lê.
- **Campo estrutural começa crescente no clique.** A tabela começava todo campo novo em
  decrescente, o que daria T8 → T2 ao clicar em "Item". `CAMPOS_ESTRUTURAIS` decide.
- **O campo `item` saiu de `SortField`**, substituído por `tier` — era a única coluna que o
  usava, e ordenava pelo código.
- **`toggleText` e o filtro `locations` saíram** junto com o modo "todas as cidades": só existiam
  para os chips de cidade dele. O teste de desempenho dos filtros continua com cinco filtros
  (`profitableOnly` no lugar de `locations`).

### Um guard que passou contra o código antigo

O teste "tier ordena por tier, depois encantamento" passou **antes** da implementação. `tier` já
era numérico na linha de teste, então o `sort` genérico ordenava por ele de carona — e o
desempate pelo código (`T4_CLOTH` < `T4_CLOTH_LEVEL1@1` < `T4_CLOTH_LEVEL2@2`) coincidia com a
ordem de encantamento. Reescrito com códigos cuja ordem alfabética **contradiz** a de encantamento
(`T4_A@2` < `T4_M@1` < `T4_Z`); aí ficou vermelho.

### O elo que os testes de ordenação não cobriam

Os testes de `sortRows` montam as linhas à mão, já com `tier`. Passariam mesmo se o engine nunca
preenchesse o campo — e a tabela ordenaria tudo como "sem tier", em silêncio. Dois testes em
`engine.test.ts` provam o preenchimento, **inclusive na linha sem preço**, que é a que precisa
manter a posição. Verificados vermelhos cortando `tier: input.outputTier` nos dois pontos onde a
linha é montada.

### Pendente pra você testar

1. Abrir `/refino` sem parâmetros e conferir a família de couro na ordem acima.
2. Clicar em **Lucro** e conferir que a ordem muda; clicar em **Item** e conferir que volta para
   T2 → T8.
3. Abrir um link antigo com `?sell_in=all` e conferir uma linha por receita.
4. Conferir que o seletor "Vender em" não tem mais a opção "Todas".
