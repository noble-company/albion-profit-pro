# 23 — Histórico da API pública: unidades por dia e preço médio

## Objetivo

Trazer da API pública do Albion Data Project o histórico de volume e preço médio, para a tela
mostrar **quantas unidades vendem por dia** junto de cada preço de venda.

## Por que

É a melhor ideia do app de referência ("UND/D: 278.244"): um lucro de +44 mil num item que vende 7
por dia não é lucro. Sem volume, a tabela mostra oportunidades que o mercado não absorve.

### O que temos hoje

- **208 itens** com histórico de 6 h no banco, 105 com o de 1 h; o rollup diário tem 66.
  _Atualização de 2026-09-11:_ esse número estava baixo porque o rollup tinha parado (achado
  `W8`). Corrigido, o banco local passou a 11.210 linhas diárias e 792 mensais. A task 23 grava na
  mesma tabela que o rollup agrega, e agora ele aguenta o volume.
- É só o que o nosso client captura, e ele captura **apenas quando o jogador abre o gráfico de
  histórico do item** (`opAuctionGetItemAverageStats`). Olhar a lista de ordens manda
  `opAuctionGetOffers`/`opAuctionGetRequests`, que vira ordem, não histórico.
- Uma aberta na aba "Semanas" traz 28 dias em blocos de 6 h (doc 03 §3, medido ao vivo).
- O poller da task 04 só puxa `/stats/prices`.

### Por que não construir o histórico a partir do poller de preço

Guardar o preço ao longo do tempo dá a **tendência do preço**, mas **não dá volume**: o livro de
ordens mostra o que está à venda, não quanto foi vendido. Uma ordem que some pode ter sido
comprada ou cancelada.

### O que a API pública tem (medido em 2026-09-10)

- `GET /api/v2/stats/history/{itens}.json?locations=…&time-scale=6` devolve blocos de 6 h
  (00/06/12/18 UTC) com `item_count` e `avg_price`: **119 pontos, ~30 dias**, desde 12/08.
- `time-scale=24` devolve a série diária, 31 pontos.
- **Aceita vários itens e cidades numa chamada:** 3 itens × 2 cidades = 6 séries, 13,6 KB, 0,78 s.
- **As duas séries são consistentes**, mas o "dia" delas começa às **06:00 UTC**. Somando os
  blocos de 6 h num dia civil, não bate em nenhum dos 30 dias; com a janela ancorada às 06:00, bate
  em 31/31, 30/30 e 30/30 (T4_LEATHER, T4_PLANKS, T5_METALBAR), com volume total idêntico.

Então não é preciso esperar semanas acumulando: **no primeiro dia já há 30**.

## O que implementar

1. **Gravar os blocos de 6 h em `market_history_entry`** (`bucket_seconds = 21600`), a mesma
   tabela do histórico do client. O rollup diário processa os dois do mesmo jeito.
   - **A série diária da API pública fica de fora**: o dia às 06:00 desalinharia com o nosso, que
     fecha à meia-noite UTC.
   - **Não gravar direto em `market_history_daily`**: `_rollup_diario` apaga e reconstrói a janela
     inteira a cada hora (`prices/tasks.py`), e o dado sumiria.
2. **O client vence a API pública** no mesmo bloco — o dado dele vem direto do servidor do jogo.
   `market_history_entry` não tem coluna de fonte; ela entra (`source ∈ {client, aodp}`), o upsert
   da API pública só atualiza linha que já é `aodp`, e o ingest do client sempre sobrescreve. É a
   mesma regra que `price_snapshot` já segue.
3. **Mapeamento:** a API pública fala `unique_name` e nome de cidade; a tabela usa `AlbionId` e
   `location_id`. Reaproveitar `item.albion_id` e o mapa de cidades da task 04.
4. **Varredura lenta e contínua.** São **5.844 itens distintos** (saídas e ingredientes) × 8
   cidades, com limite de 180 req/min e 300 req/5min. A série de 6 h de um item tem ~8,5 KB, então
   a varredura completa passa de centenas de MB — medir o tamanho real dos lotes e escolher o
   ritmo. O histórico só muda a cada 6 h, então um ciclo lento serve.
5. **Leitura para a tela:** volume médio por dia e preço médio numa janela (7 dias, a confirmar),
   por item × cidade, **por categoria** (mesmo filtro da task 22), com cache longo — o dado muda a
   cada 6 h, não a cada 30 s.
6. **Na tela:** uma linha dentro da célula de Venda (task 20), "12,4 mil/dia". Sem histórico,
   `—`, nunca zero.

## Depende de

Task **04** (poller e mapa de cidades) e **20** (a célula de Venda).

## Testes automatizados

- Bloco de 6 h da API pública é gravado com `bucket_seconds = 21600` e `source = aodp`.
- Bloco que já veio do client **não** é sobrescrito pela API pública; o client sobrescreve a API.
- O rollup diário soma blocos das duas fontes sem contar duas vezes.
- Série diária (`time-scale=24`) nunca é gravada.
- Item sem histórico aparece como ausente, não como volume zero.
- Falha de um lote não derruba a varredura.

## Testes manuais

Depois de uma varredura, abrir o gráfico de histórico de um item no jogo e comparar o volume do
dia com o da tela.

## Estado da implementação

**Concluída.** Frontend `npm run test` **507/507** · `typecheck` limpo · `lint` 0 erros (7 avisos, os
mesmos). Backend `pytest tests` **446 passaram**, 1 falha que já existia
(`test_compare_query_count_does_not_grow_with_city_count`) · `ruff` limpo.

Guards vermelhos primeiro: rota de vendas (6, com 404), histórico e varredura (o arquivo inteiro,
sem `src.prices.history`), e no frontend `vendas.test.ts` inteiro mais 3 testes de coluna e painel.

### Decisões confirmadas com o usuário (2026-09-11)

Média de **7 dias completos**; na venda pela média ou com preço fixo, **soma das cidades de Vender
em**; varredura **a cada 6 h**, a primeira com 30 dias e as seguintes com 3; **todas as qualidades**.

### O que a validação mudou

- **`date` na API pública** corta a resposta de 38,8 KB para 3,9 KB no mesmo lote (medido).
- **8.644 itens** no catálogo depois da 27, não 5.844; 39 sem `albion_id` ficam fora.
- **`avg_price` vem arredondado**: a prata do bloco é `unidades × média`. O client grava a exata.
- **O `poda`/rollup precisava aguentar o volume** — corrigido antes (achado `W8`).

### Medido na primeira varredura real

- Uma fatia (20 pedidos de 50 itens): **137 s**, nenhuma falha, **303 mil blocos** de 810 itens em
  8 cidades, de 12/08 a 11/09. A varredura inteira são 173 lotes, ~9 fatias. O beat segue sozinho.
- O rollup diário passou de 0,6 s para **4 s** depois da primeira fatia e **20 s** depois de três.
  Ele reconstrói a janela de 90 dias a cada hora; com a varredura completa (~2,6 milhões de blocos)
  pode passar de 1 min. Cabe, mas é o próximo gargalo — um rollup incremental resolveria.
- `market_history_entry` com 452 mil linhas: 163 MB com índices.
- `GET /prices/sales`: o realm (3.574 linhas) em 145 ms e **35,8 KB com gzip**; Refino › Tecido em
  25 ms e 0,8 KB; Craft › Armas › Arcos em 203 ms e 2,0 KB.
- T4_CLOTH, depois do rollup: Lymhurst **220,7 mil/dia** a 293, Thetford 76,3 mil a 312, Bridgewatch
  39,6 mil, Martlock 37,4 mil, Caerleon 19,5 mil, Brecilien 1,6 mil (2 dias).

### Achado: o histórico do client está atribuído ao item errado (`W9`)

Conferindo o volume contra a API pública, o client aparece com T4_CLOTH em Fort Sterling vendendo
30 a 87 unidades por bloco a **~105 mil** cada; a API pública, 25 a 45 mil unidades a ~330. Não é
caso isolado:

- De 118 pares item × cidade com histórico do client e preço atual no snapshot, **só 9** têm o preço
  médio do histórico entre metade e o dobro do preço atual; a razão mediana é **22×**.
- Em `market_scan`, de **440** varreduras de histórico com uma varredura de livro a menos de 90 s na
  mesma cidade, **só 43** são do mesmo item. A menos de 1 s: histórico `T5_CLOTH_LEVEL3@3`, livro
  `T4_LEATHER_LEVEL2@2`; histórico `T4_ARTEFACT_2H_BOW_KEEPER`, livro `T5_LEATHER_LEVEL4@4`.

O livro chega com o nome do item (`ItemTypeId`); o histórico, com o `AlbionId` numérico, resolvido
pelo `Index` do `items.json` do dataset (revisão `5cf2e8e9`). A explicação mais provável é o jogo
ter reordenado os índices depois dessa revisão. **Não é desta task**, mas atinge ela: a regra "no
mesmo bloco o client vence" hoje segura o bloco errado do client por cima do certo da API — é o que
deixa Fort Sterling com preço médio de 624. Os blocos guardam o `AlbionId` cru, então atualizar o
dataset para a revisão do jogo corrige a atribuição retroativamente.

### O que só apareceu implementando

- **O caractere inseparável do ICU.** `Intl.NumberFormat('pt-BR', { notation: 'compact' })` escreve
  "12,4 mil" com espaço inseparável; o formatador troca por espaço comum, com escape explícito.
- **A célula de Venda ficou mais larga** (8,5 → 10 rem): o volume divide a primeira linha com a
  cidade, porque uma terceira linha não cabe na altura fixa da tabela virtualizada.
- **`_na_categoria`** virou uma cópia só da regra de categoria, usada pelo snapshot (22) e pelas
  vendas (23), que pedem só as saídas.

### Ajuste no uso: Vende/dia mínimo (2026-09-12)

Pedido: "adicionar uma opção pra eu filtrar o volume de vendas dia". Campo **Vende/dia mínimo** no
grupo Resultado, na URL como `min_volume`.

- **O mesmo número da coluna.** `volumeDaLinha` é uma função só na tela, usada pela coluna e pelo
  filtro: venda numa cidade, o volume dela; pela média ou com preço fixo, a soma das cidades de
  Vender em.
- **Item sem histórico continua na lista** — decisão do usuário, depois de pedir o contrário e
  voltar atrás: "exibe sim, e aí eu vou lá e olho". Ausência de histórico não é zero vendido.
- **Vale antes do Top 15** e para linha com ou sem preço: volume é fato do mercado, não do cálculo.
- **Enquanto as vendas não chegam, não filtra.** Esconder tudo faria a tabela piscar vazia.
- **Texto que não é número vira sem filtro** (`decimalOuNulo`), nunca erro: o valor alimenta
  `money()` durante o render. Vírgula vale como ponto.
- Fora de `applyFilters` (`filtrarPorVolume`), porque o volume não mora na linha.

Guards vermelhos primeiro: 6 em `filters.test.ts`, 2 em `useScannerFilters.test.tsx`.

**E a caixa "Mostrar sem volume de vendas"**, pedida logo depois do uso: nasce marcada, e desmarcar
(`no_volume=false`) esconde o item sem histórico de venda — com ou sem preço, junto do mínimo ou
sozinha. Mesmo formato de "Mostrar sem preço": mostrar é o padrão, esconder é escolha. Antes das
vendas chegarem não esconde nada, porque sem o índice toda linha pareceria sem histórico. Guards
vermelhos primeiro: 9 — os 4 novos e os 5 do mínimo, que mudaram de assinatura; o de "antes das
vendas chegarem" passava de véspera, porque sem índice a função já devolvia tudo.

### Pendente pra você testar

1. Com o frontend no ar, abrir `/refino` → **Tecido**: a célula de Venda mostra "…mil/dia" ao lado da
   cidade, e o painel de uma linha tem a coluna **Vende/dia** por cidade.
2. Um item sem histórico mostra "—/dia", nunca zero.
3. No jogo, abrir o histórico de um item e comparar o volume do dia com o da tela — de preferência
   num item que o client ainda não varreu, por causa do `W9`.
