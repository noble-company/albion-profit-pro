# 18 — Taxa da estação: por nutrição, não por execução

## Objetivo

A taxa da estação passa a ser cobrada como o jogo cobra: **por nutrição consumida**, derivada do
valor do item, em vez de prata fixa por execução.

## Por que

Achado em uso real, comparando a tela com a estação aberta no jogo.

O jogo cobra uma taxa **por 100 de nutrição consumida**, e cada receita consome uma quantidade
própria:

```
nutrição consumida = itemvalue × 0,1125
taxa paga          = nutrição × (taxa por 100) / 100
```

Nós cobrávamos `taxa × execuções` — prata fixa, igual para toda receita
(`engine.ts`, `compare_service.py`).

Prova, com o print da estação (taxa 390 por 100 de nutrição) refinando Couro T4.2:

| | |
|---|---|
| `@itemvalue` de `T4_LEATHER_LEVEL2` no dump | 64 |
| nutrição = 64 × 0,1125 | 7,2 |
| taxa = 7,2 × 390/100 | **28,08** |
| o jogo mostra | **28** |
| a nossa tela mostrava | **400** |

Na linha do usuário isso movia o lucro de **−519 para −147**.

### Não é calibração, é o formato

O erro **troca de sinal** conforme o item, porque o valor do item cresce com tier e encantamento:

| item | taxa real (a 400 por 100 nut.) | o que cobrávamos |
|---|---|---|
| Couro T4 | 7,20 | 56× demais |
| Couro T4.2 | 28,80 | 14× demais |
| Couro T8 | 115,20 | 3,5× demais |
| Machado 2H T4 | 230,40 | 1,7× demais |
| Machado 2H T8 | 3.686,40 | **9× de menos** |
| Machado 2H T8 Avalon | 17.510,40 | **44× de menos** |

Nenhum número digitado naquele campo fica certo em duas linhas ao mesmo tempo. E o erro é maior
justamente na tela de Craft, onde estão os itens caros.

## O dado que falta

`@itemvalue` está no `ITEM DUMP.json` e **nunca foi importado** — a task 4/01 trouxe `@weight` e
parou ali.

E o dump não publica o campo para tudo: **771 armas e 1.126 equipamentos não têm `@itemvalue`**,
o que cobre quase toda a tela de Craft.

A saída é derivar, e a regra está no próprio dump:

> **`itemvalue` = Σ (itemvalue do ingrediente × contagem)**

Verificada em todo refino onde o dump publica os dois lados — bate exato, até a casa decimal:

```
T8_LEATHER        = T8_HIDE×5 (25,6) + T7_LEATHER×1 (128) = 256   → o dump diz 256
T4_LEATHER_LEVEL2 = T4_HIDE_LEVEL2×2 (16) + T3_LEATHER×1 (32)... → o dump diz 64
T4_2H_AXE         = T4_PLANKS×12 (16) + T4_METALBAR×20 (16) = 512  → o dump não diz nada
```

Para equipamento isso é **inferência**, não leitura — é a melhor que existe, e é a mesma regra
que o dump obedece em todo lugar onde ele publica os dois lados.

### A armadilha do encantamento

O valor **dobra a cada nível de encantamento**, e os dois padrões de nome do dump se comportam
de formas diferentes:

- **Recurso refinado** — `T4_LEATHER_LEVEL2@2`. A entrada `T4_LEATHER_LEVEL2` publica
  `@itemvalue = 64`, já o valor do nível. Ler direto funciona.
- **Equipamento** — `T4_ARMOR_LEATHER_SET1@2`. Tirar o `@2` cai na entrada **sem encanto**, cujo
  valor derivado é 256. O valor certo do nível 2 é **1.024** — quatro vezes maior. Ele sai do
  bloco `enchantments.enchantment[]`, que tem `craftingrequirements` próprio, com os
  ingredientes já encantados.

Derivar pelo nome base cobraria a taxa do item sem encanto para todo item encantado.

Nenhum item do dump tem `@itemvalue` **e** blocos de encantamento ao mesmo tempo (verificado: 0
casos), então a regra não tem ambiguidade: valor publicado ganha; na falta dele, deriva-se da
receita daquele nível.

### Cobertura

Sobre as **5.633 receitas** que importamos: **5.095 resolvem**, 538 não.

As 538 são trade packs de caravana (`QUESTITEM_CARAVAN_TRADEPACK_*`), feitos de tokens de facção
que não têm valor em nenhum ponto da cadeia. São `QUESTITEM` — não vendáveis —, então já
aparecem como "sem preço de venda" no scanner e a taxa nunca entra na conta. Valor nulo vira
nutrição zero, e isso está registrado aqui de propósito, não escondido no código.

> **Revisto na task 13 (2026-09-12, achado `W10`).** "Ausente é ausente" deixava 153 das 172
> poções sem valor — o extrato arcano e as partes de animal raro não têm — e a taxa entrava como
> zero justamente nas poções caras. Medido na estação do alquimista: o jogo **soma o que tem valor
> e conta o resto como zero** (Poção de Cura T4.1 = 432 a 320 por 100 de nutrição). A derivação
> agora faz o mesmo; a receita que resolve inteira continua vencendo. Ver
> [a task 13](13-comida-e-pocoes.md#a-taxa-da-estação-achado-w10).

## O que implementar

1. **`item.item_value`** — coluna nova, migração e importação do `@itemvalue`.
2. **Resolução por nível de encantamento** — módulo compartilhado que devolve o valor de cada
   `unique_name` (com `@N`), lendo o publicado ou derivando do `craftingrequirements` do nível.
3. **`item_value` no `/catalog/recipes`.**
4. **Engine**: `stationCostPerExecution` vira taxa por 100 de nutrição; o custo por execução
   passa a ser `itemValue × 0,1125 × taxa / 100`.
5. **Mesma mudança no backend** (`compare_service.py`, `CraftRequestBase`). Se só um lado mudar,
   o "Analisar com o livro real" passa a divergir do scanner — e o botão existe justamente para
   ser o número exato.
6. **Rótulo e chave de URL novos.** Mantendo `station_cost`, todo link salvo passaria a
   significar outra coisa em silêncio.

## Depende de

Task **01** (o catálogo de itens) e **05** (o engine). Afeta a **06** (vetores dourados).

## Testes automatizados

- O valor publicado vence a derivação, e a derivação bate com o publicado onde os dois existem.
- Equipamento encantado resolve pelo bloco do nível, não pelo nome base — `@2` vale quatro vezes
  o `@0`.
- Ciclo na cadeia de receitas não trava a resolução.
- A taxa da estação de uma receita conhecida bate com o jogo: Couro T4.2 a 390 dá 28.
- Valor nulo não vira taxa arbitrária.

## Testes manuais

Abrir a mesma receita na estação do jogo e conferir o "Custo em prata" contra a coluna.

## Estado da implementação

**Concluída.** Backend `pytest` **428 passed** (1 falha pré-existente, ver abaixo) · `ruff` limpo ·
frontend `test` **401/401** (+7) · `lint` 0 erros · `typecheck` limpo. Guards vermelhos primeiro.

### Onde a conta mora

`calculate_station_fee` em `craft/formulas.py`, espelhada por `calculateStationFee` em
`lib/craft-formulas.ts`. É o mesmo par que já sustentava o resto das fórmulas — os vetores
dourados travam os dois lados, e `engine.golden.test.ts` voltou verde com o valor do item
viajando no vetor. Cliente e servidor continuam batendo string a string.

**Sem arredondamento, de propósito.** O jogo mostra 28 para 28,08, mas onde ele arredonda a
prata parcial — por execução ou no total — não está estabelecido. Inventar a regra fingiria uma
precisão que a medição não tem. O que existe é o corte do ruído de casas decimais
(`28.08000000` → `28.08`), que é serialização, não conta.

### A derivação, e o que ela custou

`scripts/_item_values.py` resolve o valor de cada `unique_name`, com memo e guarda de ciclo.
Cobertura no catálogo real: **9.517 de 12.062 itens**; das 5.633 receitas, 5.095 resolvem.

O caso que quase passou batido é o encantamento. Os dois padrões de nome do dump se comportam
de formas **opostas**: `T4_LEATHER_LEVEL2@2` tem entrada própria com o valor do nível (64), e ler
direto é o certo; `T4_ARMOR_LEATHER_SET1@2` cai na entrada sem encanto se você tirar o `@2`, e
o valor certo (1.024, quatro vezes maior) só sai do bloco `enchantments.enchantment[]`. Derivar
pelo nome base cobraria a taxa do item sem encanto para todo item encantado.

`resolve_item_values` recebe a lista de nomes de `items.json` em vez de enumerar o dump: três
extratos de alquimia não declaram `@enchantmentlevel`, e o conjunto derivado do dump os perderia.

### A chave da URL mudou junto

`station_cost` virou `station_fee`, e `station_cost_per_execution` virou
`station_fee_per_100_nutrition` no contrato HTTP. Mantendo os nomes, um link salvo com
`station_cost=400` passaria a significar outra coisa em silêncio — e o número certo para aquele
refino era 28.

O caminho do ranking materializado (`ranking_service.py`, `production-pages.tsx`,
`ranking-projection.ts`, `generate_projection_vectors.py`) **não foi migrado**: ele é apagado
inteiro na task 15, e mexer nele seria trabalho jogado fora. Só o suficiente para compilar.

### Falha pré-existente encontrada no caminho

`tests/craft/test_compare_router.py::test_compare_query_count_does_not_grow_with_city_count`
falha com `assert 13 == 12`. Verificado com `git stash` que ela **já falhava antes** desta task:
Lymhurst passou a ter dois mercados (`1002` e `1301`) na 11.2.2, e o endpoint de comparação
ranqueia por mercado. Não corrigida aqui — é outra decisão (fundir mercados no servidor, como o
cliente faz, ou aceitar duas linhas de Lymhurst).

### As duas telas, um caminho só

`/refino` e `/craft` são o mesmo `ScannerPage` com o mesmo `computeScanner` — a diferença é que
o craft roda no Worker. O valor do item viaja na mensagem `data`, dentro do catálogo, e **não**
na linha, então o tipo mapeado de `ScannerRow` (a rede que a task 12 armou contra campo que
some) não cobre este caso: se a mensagem um dia deixar de levar `item_value`, o refino continua
certo e só o craft para de cobrar a estação.

Guard `o craft cobra estação igual ao refino`: roda o mesmo cenário pelos dois caminhos e compara
as strings, mais a diferença contra a mesma conta sem estação. Verificado vermelho cortando o
valor do item no engine.

### Pendente pra você testar

1. Abrir a mesma receita na estação do jogo e conferir o "Custo em prata" contra o extrato.
2. Conferir um item **encantado** e um **equipamento** — são os dois casos onde a derivação é
   inferência, não leitura do dump.
3. O campo agora pede a **taxa por 100 de nutrição** (o número no topo da janela da estação),
   não a prata por execução.
