# 03 — `price_snapshot` + `GET /prices/snapshot`

> Corrige `X03`. É o par da task 02: catálogo de um lado, preço do outro, e o cliente junta.

## Objetivo

Servir o **topo de livro em massa** para um realm, sem filtro de frescor e sem esconder nada —
cada linha diz de quando e de onde o preço veio.

## Por que

Hoje não existe leitura de preço em massa por HTTP. As rotas de preço servem **um item por
vez** (`GET /items/{item_id}/prices`), e a capacidade em lote existe só internamente
(`query_book_depth` / `query_executable_book_levels`, que recebem lista de combos).

Sem isso, o cliente não tem como calcular nada sozinho — e é por isso que o cálculo acabou num
job de 10 em 10 minutos no servidor.

Além disso, a task 04 vai trazer preço de uma **segunda fonte** (a API pública). Escrever as
duas fontes direto em `market_order` seria errado: aquela tabela é o *livro de ofertas*, uma
linha por leilão do jogo, com `source_id` e profundidade. A API pública não dá leilões, dá
**topo de livro agregado**. São dados de natureza diferente e merecem tabela própria.

## O que implementar

1. **Tabela `price_snapshot`** — grão `(server_id, item_id, location_id, quality_level,
   enchantment_level)`, único. Mesma identidade que `latest_order_observation_filter`
   (`src/prices/service.py:39-65`) já usa, para os dois lados casarem.

   **Os dois lados do livro são independentes**, cada um com seu valor, timestamp e fonte:

   | Coluna | Significado |
   |---|---|
   | `sell_min` | menor `offer` — o que você **paga** para comprar agora |
   | `sell_observed_at`, `sell_source` | quando e de onde veio esse lado |
   | `buy_max` | maior `request` — o que você **recebe** vendendo agora |
   | `buy_observed_at`, `buy_source` | idem |

   `source ∈ {client, aodp}`. Lados separados porque é comum ter um sem o outro, e porque a API
   pública já entrega `sell_price_min_date` e `buy_price_max_date` **distintos**. Juntar os dois
   num timestamp só mentiria sobre a idade de um deles.

2. **Escrita a partir do nosso ingest** — em `src/ingest/service.py`, junto do upsert em
   `market_order`, derivar o topo de livro dos combos do lote e gravar com `source='client'`.
   Reaproveitar `latest_order_observation_filter` para não misturar observação nova com ordem
   velha.

3. **Precedência por lado: o mais recente vence.** O upsert só sobrescreve um lado se o
   `observed_at` que chega for **mais novo** que o gravado. Assim a task 04 nunca apaga um preço
   fresco do nosso client com um dado velho da API pública, e vice-versa.

4. **`GET /prices/snapshot?server=&location_id=`** — `location_id` repetível e opcional.
   **Sem filtro de frescor, sem filtro de preço mínimo, sem paginação.** Devolve o que existe
   com `observed_at` e `source` por lado; quem decide o que esconder é a tela.

5. **Contrato em inglês** (`B09`); preços como **string decimal** (`F09`).

### Formato: medir antes de otimizar

O plano da fase falava em formato colunar. **Decisão desta task: começar com array de objetos
legível e medir.** A conta que justifica: uma cidade tem ~3 mil combos com preço, e a tela do
scanner trabalha por cidade — o payload de uma cidade é pequeno mesmo sem otimização. O formato
colunar só se paga na visão de 8 cidades lado a lado, que é a task 11.

**Orçamento: ≤ 60 KB gzipped por cidade.** Se estourar, aí sim colunar — com o número medido na
mão, não por suposição. Registrar a medição no estado da implementação de qualquer jeito.

## Bibliotecas/dependências

Nenhuma nova.

## Depende de

Nada (paralela à task 02).

## Testes automatizados

- Ingerir um lote e ler o snapshot: `sell_min` é o **menor** `offer` e `buy_max` o **maior**
  `request` do combo.
- **Um lado sem o outro** (só `offer`) devolve `buy_max = null` com `buy_observed_at = null` —
  ausência, nunca zero.
- **Precedência**: gravar `aodp` com `observed_at` antigo **não** sobrescreve um `client` mais
  novo; gravar `aodp` mais novo sobrescreve. Testar nos dois sentidos, por lado.
- Observação nova do mesmo combo **substitui** a anterior (não acumula linha).
- O endpoint **não** filtra por frescor: preço de 30 dias atrás aparece, com o `observed_at`
  denunciando a idade. É a regressão direta de `X02`.
- `location_id` repetido restringe; ausente devolve o realm inteiro.
- Autenticação exigida (401 sem token).
- `test_api_language.py` verde com os schemas novos.

## Testes manuais

```bash
curl -s "localhost:8000/prices/snapshot?server=west&location_id=1002" \
  -H "Authorization: Bearer $TOKEN" -H "Accept-Encoding: gzip" \
  -o /tmp/snap.gz -w "gzip: %{size_download} bytes\n"
```

Conferir contra o jogo: abrir o mercado de Lymhurst num item e ver se `sell_min` bate com a
oferta mais barata e `buy_max` com a ordem de compra mais alta da tela.

## Estado da implementação

**Concluída.** Backend: `uv run pytest tests/ -q` → **376 passed** (+11) · `ruff` limpo.
Frontend: `typecheck` limpo · `test` **204/204** · `schema.d.ts` regerado.

- **Tabela `price_snapshot`** (migração `b8e1d3f5a2c7`, escrita à mão pelo mesmo motivo da
  `a7f3c2b9d0e4`) — grão `(server, item, location, quality, enchantment)`, com os dois lados
  independentes: `sell_min`/`sell_observed_at`/`sell_source` e `buy_max`/`buy_observed_at`/
  `buy_source`.
- **`src/prices/snapshot.py`** — `refresh_snapshot_from_orders` (deriva topo de livro de
  `market_order` via `latest_order_observation_filter`, descarta expirada, **sem** janela de
  frescor), `upsert_snapshot` (a regra de precedência), `read_snapshot`, `to_columnar`.
- **Gancho no ingest** — `src/ingest/service.py` grava o snapshot **na mesma transação** do
  upsert do livro: se `market_order` foi gravado, o snapshot que o cliente lê já reflete isso.
- **`GET /prices/snapshot`** em `snapshot_router` próprio (o `router` de preços tem prefixo
  `/items`; snapshot é leitura de realm, não de item).

### Guard em vermelho antes da correção

Trocando o `case((newer, excluded), else_=stored)` do upsert por sobrescrita incondicional, os
testes de precedência falham com `assert Decimal('999.0000') == Decimal('130')` — o preço velho
da API pública apagando o preço fresco do nosso client. É exatamente o modo de falha que a
regra existe para impedir.

### O formato mudou por medição, não por suposição

A spec previa colunar mas mandava **medir primeiro**. Medido com 281 combos reais:

| Formato | B/linha (gzip) | 1 cidade (3 mil) | 8 cidades (25 mil) |
|---|---:|---:|---:|
| Array de objetos (legível) | 23,0 | ~67 KB ❌ | ~560 KB |
| **Colunar** | **13,6** | **~40 KB ✅** | ~333 KB |

O array de objetos **estourou** o orçamento de 60 KB/cidade, então o formato virou colunar:
chaves uma vez só, `item_id`/`location_id`/`source` viram índices de dicionário, e
`observed_at` vira **epoch em segundos** em vez de ISO (29 caracteres por lado, por linha). Cru
caiu 4,2×; gzipped, 1,7× — o gzip já absorvia parte da repetição de chave.

`sell_min`/`buy_max` continuam **string decimal**: a compactação não passa por cima do `F09`.

O teste `_linhas()` desfaz o formato colunar em ~20 linhas — é o mesmo que o cliente vai fazer,
e serve de prova de que o formato não é difícil de consumir.

### Limite conhecido, não resolvido

As **8 cidades de uma vez dão ~333 KB**. Cabe para uma busca sob demanda, não para um poll de
30 s. A visão de comparação lado a lado (task 11) vai precisar decidir entre buscar uma vez com
cache longo ou ganhar um parâmetro de delta (`?since=`). Registrado aqui para a task 11 não
descobrir isso no meio do caminho.

### Pendente pra você testar

Com o client capturando, abrir o mercado de um item em Lymhurst e comparar:

```bash
curl -s "localhost:8000/prices/snapshot?server=west&location_id=1002" -H "Authorization: Bearer $TOKEN" | python -m json.tool | head -40
```

`sell_min` tem que bater com a **oferta mais barata** da tela do jogo e `buy_max` com a **ordem
de compra mais alta**.
