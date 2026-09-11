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

_Não iniciada._
