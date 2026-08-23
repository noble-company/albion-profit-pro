# Contrato de ingest real — medido com o jogo ao vivo

> Capturado em **2026-08-22**, com o `albiondata-client` rodando contra um sink HTTP local
> (`-i http://localhost:9099`, sem `-d`) e o jogo aberto. Item observado: **algodão T2
> (`T2_FIBER`, `AlbionId` 1020)**, qualidade 1, em `1000-HellDen`.
>
> **Este documento tem precedência sobre qualquer suposição anterior.** Tudo aqui foi medido,
> não inferido. Os payloads crus estão versionados em `backend/tests/fixtures/wire/`.

## Por que este documento existe

A Fase 1 do backend foi construída inteiramente contra payloads *inventados* (dicts escritos à
mão nos testes). Os schemas acertaram o formato, mas **três propriedades semânticas dos dados
passaram despercebidas** e invalidam cálculos inteiros. Todas aparecem abaixo.

---

## 1. Prata vem multiplicada por 10.000

**Todo campo de prata no fio é o valor real × 10⁴.** Medido: 167/167 valores de
`SilverAmount` no histórico são múltiplos exatos de 10000, e o livro concorda:

```json
{"ItemTypeId":"T2_FIBER","UnitPriceSilver":370000,"Amount":34,"AuctionType":"offer"}
```

`370000 / 10000 = 37 silver` — bate com a média de ~35-39 do histórico do mesmo item.

| Campo | Tópico | Real |
|---|---|---|
| `UnitPriceSilver` | `marketorders.ingest` | `valor / 10000` |
| `SilverAmount` | `markethistories.ingest` | `valor / 10000` (é o **total** do bucket, não o unitário) |

Preço médio de um bucket de histórico = `SilverAmount / ItemAmount / 10000`.

> ⚠️ O backend hoje grava esses números crus, como `BigInteger`, sem conversão e sem nota.
> Qualquer conta de lucro sai errada por 4 ordens de grandeza. Ver [task 25](tasks/backend/25-normalizacao-escala-e-tempo.md).

## 2. Timestamps são ticks do .NET

`Timestamp` (histórico) e vários campos do protocolo (`opMove`, `evRegeneration*`) usam
**ticks de 100 ns desde 0001-01-01**, não epoch Unix.

```
unix_segundos = (tick - 621355968000000000) / 10_000_000
```

Conferido: `639229968000000000` → `2026-08-22`, exatamente o dia da captura. A constante
`621355968000000000` já existe no próprio client, em `client/event_festivities_update.go:13`.

O client **não converte** — repassa o valor cru do jogo
(`client/operation_auction_get_item_average_stats.go`). A conversão é responsabilidade nossa.

## 3. As três "timescales" são UMA série só

`Timescale` no protocolo **não é a granularidade** — é a *janela*. A granularidade real do
bucket é outra coisa:

| `Timescale` | Nome no client | Janela | **Bucket real** | Pontos medidos |
|---|---|---|---|---|
| `0` | Hours | 24 h | **1 hora** | 25 |
| `1` | Days | 7 dias | **6 horas** | 29 |
| `2` | Weeks | 28 dias | **6 horas** | 113 |

E não são séries independentes — é o mesmo dado, recortado:

- Dos **29** timestamps que `Timescale=1` e `Timescale=2` têm em comum, **29/29** trazem
  `ItemAmount` e `SilverAmount` idênticos.
- Os buckets de 1 h somam **exatamente** nos buckets de 6 h. Exemplo real:
  `2026-08-21 18:00` → soma dos 6 pontos horários `(91996, 35844290000)` = bucket de 6 h
  `(91996, 35844290000)`.

### Consequências

1. **`Timescale` não pode fazer parte da identidade de uma linha.** Ele descreve *como
   perguntamos*, não *o que o dado é*. A identidade correta usa o **tamanho do bucket**
   (`3600` ou `21600` segundos). Ver [task 26](tasks/backend/26-remodelar-market-history.md).
2. Com o schema atual (`timescale` na constraint única), **um único usuário abrindo as três
   abas grava 29 linhas duplicadas** — antes de multiplicar por N usuários.
3. **28 dias de histórico saem de UM scan** (`Timescale=2`), a 6 h de resolução. Não é
   preciso acumular ao longo de semanas, e a granularidade é melhor que diária.
4. Os timestamps **não vêm ordenados** (confirmado no dado e no comentário do próprio client,
   `lib/marketHistory.go:31`). O client ordena antes de subir, mas o ingest não deve depender disso.

## 4. `LocationId` não é um código numérico

Todas as 194 ordens capturadas vieram com:

```
"LocationId": "1000-HellDen"
```

Não é o código de 4 dígitos que a lista `LOCATIONS` hardcoded em `src/prices/service.py`
assume — aquele endpoint retornaria **vazio** pra esse dado. Formatos conhecidos:

| Formato | Exemplo | Origem |
|---|---|---|
| Numérico puro | `"1002"` | cidades reais |
| Numérico + sufixo | `"1000-HellDen"` | Hell Den / covil de contrabandista |
| Com `@` | `"...@..."` | rest / smuggler den (tratado explicitamente em `operation_auction_get_offers.go`) |

`String(16)` é apertado demais pra isso. Ver [task 28](tasks/backend/28-tabela-item-e-localizacao.md).

## 5. Payload real — `marketorders.ingest`

```json
{
  "Orders": [
    {
      "Id": 15280240815,
      "ItemTypeId": "T2_FIBER",
      "ItemGroupTypeId": "T2_FIBER",
      "LocationId": "1000-HellDen",
      "QualityLevel": 1,
      "EnchantmentLevel": 0,
      "UnitPriceSilver": 370000,
      "Amount": 34,
      "AuctionType": "offer",
      "Expires": "2026-09-21T06:39:47.636097"
    }
  ]
}
```

- `Id` é o id do leilão no jogo — **estável entre varreduras**, é a chave natural de dedup.
- `Expires` é ISO 8601 **sem timezone**, com precisão variável: medimos comprimentos
  **24, 25 e 26** (o Go corta zeros à direita dos microssegundos). Qualquer parser precisa
  aceitar de 0 a 6 casas decimais. A validade observada foi de **30 dias** a partir da captura.
- `AuctionType` (`"offer"` = venda, `"request"` = compra) **é por ordem, e não dá pra inferir
  pelo endpoint**: a resposta de `opAuctionGetOffers` (opcode 81) trouxe ordens
  `"AuctionType":"request"` misturadas.

### Duplicação medida

Uma única visita ao mercado, ~10 segundos, gerou 4 payloads:

| Payload | Ordens |
|---|---|
| #1 | 50 |
| #2 | 47 |
| #3 | 47 (os **mesmos** `Id`s do #2) |
| #4 | 50 (os **mesmos** `Id`s do #1) |

**194 linhas recebidas para 97 ordens reais — exatamente 2,0×.** O backend hoje gravaria as 194.
Ver [task 27](tasks/backend/27-remodelar-market-order.md).

### Os dois lados do livro são universos separados

| Lado | Faixa medida (silver real) |
|---|---|
| `offer` (venda) | 37,0 – 39,0 |
| `request` (compra) | **1,0** – 35,0 |

A chave de cache atual (`price:{item}:{cidade}:{qualidade}`) ignora `AuctionType`, então quem
grava é a primeira ordem do lote. O preço cacheado do algodão T2 pode virar **1 silver** — e a
calculadora diria que craftar com algodão é lucro infinito.
Ver [task 29](tasks/backend/29-precos-por-lado-e-profundidade.md).

## 6. Payload real — `markethistories.ingest`

```json
{
  "AlbionId": 1020,
  "LocationId": "1000-HellDen",
  "QualityLevel": 1,
  "Timescale": 2,
  "MarketHistories": [
    {"ItemAmount": 3575, "SilverAmount": 1371130000, "Timestamp": 639229968000000000},
    {"ItemAmount": 4890, "SilverAmount": 1787060000, "Timestamp": 639229752000000000}
  ]
}
```

- `AlbionId` é o **Index numérico** do `items.json` (1020 = `T2_FIBER`), enquanto
  `marketorders.ingest` usa a **string** `ItemTypeId`. São identificadores diferentes para o
  mesmo item, e hoje **não existe tabela `item` no banco** que ligue os dois.
  Ver [task 28](tasks/backend/28-tabela-item-e-localizacao.md).
- `MarketHistoriesUpload` **não carrega encantamento** — ele está embutido no `AlbionId`
  (itens encantados têm Index próprio).

## 7. Validação dos schemas atuais

Os schemas Pydantic da task 15 foram rodados contra os payloads reais:

```
MarketUploadIn          -> 4 payloads aceitos, 0 rejeitados
MarketHistoriesUploadIn -> aceito (albion_id=1020, timescale=2, 113 pontos)
```

**O contrato de campos está correto.** Os problemas são todos de *semântica* (escala, unidade
de tempo, identidade), não de formato.

## 8. Fixtures versionadas

| Arquivo | Conteúdo |
|---|---|
| `backend/tests/fixtures/wire/marketorders-real-t2fiber.json` | 50 ordens reais, `offer`, `1000-HellDen`, sem encantamento |
| `backend/tests/fixtures/wire/markethistories-real-t2fiber-ts2.json` | 113 buckets de 6 h, 28 dias |
| `backend/tests/fixtures/wire/marketorders-real-t4fiber-ench3-offer.json` | 50 ordens, **encantamento 3**, cidade `5003` (2026-08-23) |
| `backend/tests/fixtures/wire/marketorders-real-t4fiber-ench3-request.json` | 11 ordens de **compra** (`request`) — as antigas eram 100% `offer` |
| `backend/tests/fixtures/wire/markethistories-real-t4fiber-ench3-ts2.json` | 113 buckets, `AlbionId` 1037 |
| `backend/tests/fixtures/wire/mapdata-real-5003.json` | `mapdata.ingest` real — prova que o tópico é publicado em jogo normal |

Devem substituir os dicts inventados nos testes de contrato.
Ver [task 36](tasks/backend/36-limpeza-e-refactor-de-testes.md).

## 8a. Realm no transporte e na identidade (implementado em 2026-08-23)

O corpo JSON original do Albion Data Client não identifica a economia de origem. No Profit Pro,
o uploader autenticado acrescenta o header obrigatório `X-Albion-Server`, com um dos valores
canônicos `west`, `east` ou `europe`. O valor vem do `AODataServerID` já descoberto pelo tráfego
do jogo: 1 = West, 2 = East, 3 = Europe. Destinos HTTP comuns e `+pow` não recebem esse metadado.

Realm desconhecido nunca vira West por default: o client segura somente o upload autenticado,
loga e avisa de forma debounced até identificar o servidor. O backend valida o header antes do
RabbitMQ e inclui realm no envelope Celery. A identidade de ordens, buckets históricos,
cobertura, rollups, cache, pub/sub e leituras inclui o realm; as APIs exigem `server`
explicitamente e o devolvem na resposta.

Para a migration dos dados anteriores a esse contrato, o proprietário confirmou em 2026-08-23
que toda a coleta legada ocorreu no **West**. Portanto o backfill para `west` é uma decisão com
proveniência explícita, não uma inferência técnica.

## 8b. Craft e refino — `evCraftItemFinished` (medido 2026-08-23)

> Capturado com `-events "10,49,71,94" -operations "2,47,48" -debug -d`, personagem
> **Chiroechi**. Logs brutos em `docs/capturas/`. Fecha as perguntas em aberto da
> [task 06](tasks/client/06-captura-craft-refino.md).

### O evento não diz quanto foi produzido — diz quanto foi **devolvido**

Esta é a correção mais importante, e ela **contradiz** a leitura anterior do
[doc 01 §8](01-mapeamento-albiondata-client.md).

**Medição controlada**, com screenshot do jogo confirmando cada número: refinar **exatamente
10× T2_FIBER** numa Tecelagem, taxa de retorno **36,7%**, **sem foco**. Resultado no jogo: 10
Tecido Simples produzidos e **4 Algodões devolvidos** (mensagem "Salvei … x4"). O que o fio
trouxe foi **um único evento**:

```
[10] evCraftingFocusUpdate - 0:129436 1:7361236 3:28671
[71] evCraftItemFinished   - 0:129436 1:1413 2:[129816] 3:[1020] 4:[]byte(len=1) 04
[49] evCraftBuildingInfo   - 0:1413 1:4500000 2:9990000 4:34211269350
```

`3:[1020]` é T2_FIBER e `4:[04]` são **os 4 Algodões devolvidos** — não os 10 consumidos, nem
os 10 tecidos produzidos.

| Campo | Significado | Como foi confirmado |
|---|---|---|
| `0` | ID do ator (**efêmero, muda a cada zona**) | bate com o ator do evento privado de foco |
| `1` | ID da estação | constante entre eventos na mesma estação |
| `2` | Instância do item de saída (slot) | constante ao longo do lote |
| `3` | **Itens devolvidos** pela taxa de retorno | `[1020]` = Algodão, o item que voltou pro inventário |
| `4` | **Quantidade devolvida**, paralela ao campo 3 | `04` = os 4 Algodões da mensagem "Salvei x4" |

O campo `4` é sempre um array de bytes do **mesmo tamanho** do campo `3` (verificado em todos os
eventos capturados): 1 ingrediente → 1 byte, 2 ingredientes → 2 bytes.

> ⚠️ **Consequência para a calculadora:** o evento **não carrega a quantidade produzida**. Ele
> identifica *que* houve um craft, *onde*, e *o que foi devolvido*. Quantidade produzida precisa
> ser inferida (receita + entrada) ou virá de outro evento ainda não identificado. Isso limita o
> escopo do que as tasks 07-09 conseguem entregar e precisa ser decidido antes de modelar a
> tabela.

**Corolário — `3:[]byte{} 4:[]byte{}` não é "fim de lote".** O doc 01 §8 interpretava os eventos
com campos 3 e 4 vazios como marcador de fim da sessão de craft. São, na verdade, **crafts em que
nada foi devolvido** — resultado normal da RNG da taxa de retorno. Na sessão não controlada, 44
dos 52 eventos eram assim (a maioria de outros jogadores).

### Craft e refino são o mesmo evento

Refino de fibra e craft de `T2_HEAD_CLOTH_SET1` (Capote de Erudito do Novato, 8× T2_CLOTH)
produziram eventos de estrutura **idêntica** — só mudam a estação e os itens. Não há campo que
distinga um do outro. Um handler só atende os dois casos.

### Como isolar os eventos do próprio jogador

**`evCraftingFocusUpdate` (10) é privado** — só chega para o dono. Foi assim que o ator local foi
isolado, e o número mostra que importa: numa cidade cheia (**544 personagens em cena**,
**14 atores distintos** emitindo `evCraftItemFinished`), **apenas 2** receberam evento de foco — e
os 2 correspondiam exatamente às duas ações que o jogador tinha acabado de fazer. Sem esse filtro,
12 de 14 atores seriam ingeridos como se fossem do usuário.

Dois cuidados para quem for implementar:
- **O ID do ator é de sessão e muda a cada transição de zona** (observado: `113761` → `117239` →
  `129436` no mesmo personagem). Precisa ser reaprendido, não persistido.
- **`evNewCharacter` (29) não serve de ponte**: ele dispara para *outros* jogadores entrando em
  cena, nunca para o próprio. Testado — nem o nome nem o GUID do jogador local aparecem nos 544
  eventos capturados.

### Foco

No `evCraftingFocusUpdate`, o campo `3` bate **exatamente** com o foco disponível exibido na UI
(`3:28671` ↔ "Foco: 0 / 28.671"). O campo `1` é um contador interno maior (`7361236`), de escala
ainda não determinada — cresce sozinho ao longo do tempo (regeneração passiva).

### `evCraftBuildingInfo` (49) — taxa de uso da estação

**Este é o dado mais valioso da captura**, e o motivo de existir das tasks 07-09 (ver a nota de
escopo na [task 09](tasks/client/09-backend-ingest-craft.md)).

O campo `2` é a **taxa de uso da estação, em prata ×10.000** (mesma escala do achado `N1`).
Confirmado por screenshot: a estação `1413` ("Tecelagem do Ancião") exibia na UI *"Taxa de uso por
100 de Nutrição consumida: **999**"*, e o evento trouxe `2:9990000`.

| Estação | Campo 1 ÷10⁴ | Campo 2 ÷10⁴ | Confirmado na UI |
|---|---|---|---|
| 1413 | 450 | **999** | ✅ "999" |
| 1346 | 450 | 950 | — |
| 1391 | 440 | 495 | — |

O campo `1` fica quase constante (440-450) entre estações — provavelmente uma taxa base ou custo
padrão, **não confirmado**. O campo `4` varia muito (`34211269350`, `1469430000`, `712800`), sem
interpretação ainda.

**Por que isso importa:** a taxa é definida pelo **dono da estação**, muda a toda hora, e entra
direto no custo de qualquer craft. Receita, preço de mercado e taxa de mercado são públicos —
qualquer um tem. Taxa de estação ao vivo, por cidade, **não existe em lugar nenhum**. É o insumo
que permite responder *"onde sai mais barato produzir isso agora"*.

> Nota de produto (decidida em 2026-08-23): a calculadora é ferramenta de **planejamento** — o
> jogador informa quanto quer produzir e vê custo/lucro. Portanto **a quantidade que ele produziu
> de fato é irrelevante**, e a ausência dela no `evCraftItemFinished` (ver acima) deixa de ser
> uma limitação. O que os eventos de craft precisam entregar é **taxa de estação** e, em segundo
> plano, taxa de retorno observada.

## 9. Como reproduzir a captura

```bash
# 1) sink local que grava cada POST em disco (backend/scripts/capture_sink.py, task 36) —
#    invocação canônica (mesmo motivo de import_items.py/import_recipes.py): de dentro de
#    backend/, como modulo, nao como script solto
cd backend
uv run python -m scripts.capture_sink

# 2) client apontado pro sink — NAO usar -d: com -d ele nem serializa o payload,
#    so loga "Upload is disabled" (client/dispatcher.go:113)
cd albiondata-client
./albiondata-client.exe -i http://localhost:9099 -debug
```

**Armadilha importante:** o client só sobe qualquer coisa depois de ver uma **transição de
zona**. Se ele for iniciado com o jogador já parado dentro da cidade, `IsValidLocation()` é
falso e todo handler retorna antes de enviar — silenciosamente, só com um `ERRO` no log:

```
The players location has not yet been set. Please transition zones so the location can be identified.
```

É preciso atravessar uma passagem de zona com o client já rodando. Isso é um problema de
produto pra Fase 2/3, não só de teste — ver
[01-mapeamento-albiondata-client.md](01-mapeamento-albiondata-client.md) seção 9.

## 10. Validação aplicada na borda (Fase 2.5, Task 07)

Os limites abaixo combinam os structs Go, as fixtures reais desta documentação e a capacidade das
colunas PostgreSQL. Números no JSON precisam ser números de verdade; strings numéricas não são
coagidas.

### `marketorders.ingest`

| Campo | Domínio aceito |
|---|---|
| `Id` | inteiro positivo de 64 bits |
| `ItemTypeId` | string não vazia, até 64 caracteres |
| `ItemGroupTypeId` | até 64 caracteres; vazio continua aceito porque já ocorre no client |
| `LocationId` | string não vazia, até 64 caracteres; formatos numérico, `-` e `@` continuam válidos |
| `QualityLevel` | `1..5` |
| `EnchantmentLevel` | `0..4` |
| `UnitPriceSilver` | inteiro positivo de 64 bits, ainda na escala ×10.000 do wire |
| `Amount` | inteiro positivo de 64 bits |
| `AuctionType` | somente `offer` ou `request` |
| `Expires` | `YYYY-MM-DDTHH:MM:SS`, com 0..6 casas decimais e timezone ausente, `Z` ou offset |

`Expires` sem timezone é interpretado como UTC, pois é o formato real do client. Qualquer timezone
explícito é convertido para UTC e o valor interno sai canônico com `+00:00`.

### `markethistories.ingest`

- `AlbionId` é positivo e cabe em `int32`, exatamente como o struct Go;
- qualidade é `1..5`, timescale é `0..2` e localização segue o mesmo limite de 64 caracteres;
- `MarketHistories` contém `1..5000` pontos;
- `ItemAmount` é `0..int64`, porque o client corrige/descarta negativos mas não descarta zero;
- `SilverAmount` é `0..uint64`;
- `Timestamp` é tick .NET a partir de 1970 e precisa converter para um `datetime` UTC suportado.
  Isso rejeita epoch Unix ou overflow ainda na API, antes do RabbitMQ.

### `goldprices.ingest`

O ouro é a exceção temporal: seu struct usa **epoch Unix**, não ticks .NET. `Prices` e
`Timestamps` aceitam inteiros não negativos de 64 bits, no máximo 5000 elementos, e precisam ter
o mesmo tamanho. O tópico continua fora do escopo de persistência, mas payload desalinhado não
chega ao worker.

### Defesa em profundidade e tamanho do corpo

As invariantes essenciais também existem como `CheckConstraint` em `market_order`,
`market_history_entry` e `market_scan`. Assim, bug no worker ou outro produtor não contorna o
contrato HTTP.

A aplicação limita o corpo bruto a **10 MiB (10.485.760 bytes)** com o middleware oficial do
Starlette. O limite conta os bytes recebidos mesmo sem `Content-Length`, com transferência
chunked ou com header subestimado. Header malformado retorna 400; corpo acima do teto retorna 413.
Respostas 422 e logs contêm somente caminho/localização/tipo/mensagem do erro — nunca o valor
rejeitado ou o corpo inteiro. Referências: [Starlette — RequestBodyLimitMiddleware](https://www.starlette.io/middleware/#requestbodylimitmiddleware)
e [FastAPI — RequestValidationError](https://fastapi.tiangolo.com/tutorial/handling-errors/#override-request-validation-exceptions).

Quando o stack Traefik for materializado na Task 11, o router da API deve receber o middleware de
buffering com o mesmo teto:

```text
traefik.http.middlewares.profitpro-body-limit.buffering.maxRequestBodyBytes=10485760
```

O proxy rejeita cedo; o limite da aplicação continua obrigatório para acesso direto e defesa em
profundidade.
O comportamento esperado do proxy está documentado em
[Traefik — Buffering](https://doc.traefik.io/traefik/middlewares/http/buffering/).

## 11. Cobertura do livro: recorte parcial (Fase 2.5, Task 12)

As capturas disponíveis **não comprovam snapshot completo** de uma combinação. A fixture real
versionada contém 50 ordens, e a captura original produziu lotes de 50/47/47/50 ordens com IDs
repetidos entre respostas. O protocolo observado não traz número de página, total esperado,
`scan_id` nem marcador confiável de conclusão. Portanto, ausência em um lote posterior não prova
que uma ordem foi comprada ou cancelada.

A decisão conservadora é tratar toda resposta de `marketorders.ingest` como **recorte parcial**:

- o ingest faz upsert por `(realm, source_id)` e nunca remove uma ordem apenas porque ela não veio
  no lote seguinte;
- ordens expiradas ou fora da janela configurada não entram nos agregados;
- a API usa `melhor_preco`, `unidades_observadas` e `ordens_observadas`, com `observado_em` e
  `idade_segundos` separados para compra e venda; o instante/idade pertence à ordem que definiu o
  melhor preço, não simplesmente à ordem mais recente daquele lado;
- cada combinação declara `cobertura: "parcial"` e `janela_frescor_segundos`;
- o default de frescor continua em 6 horas, centralizado em `prices.policy`, mas permanece uma
  decisão de produto a validar com operação real.

`GET /items/{item}/prices` consulta somente combinações existentes para item/realm/escopo, aceita
filtro repetível `location_id` e pagina com `limit`/`offset`; o retorno inclui `total`. Uma chave
Redis sem combinação correspondente no PostgreSQL é ignorada, e o namespace versionado `livro:v2`
impede que o contrato antigo seja reutilizado.

O plano representativo foi medido com `EXPLAIN (ANALYZE, BUFFERS)` sobre 3.000 ordens. O PostgreSQL
usou `ix_market_order_book` para reduzir por realm/item/local/qualidade; encantamento, lado,
expiração e frescor permaneceram como filtros do agregado. Não houve evidência que justificasse
uma migration adicional nesta escala; o teste automatizado preserva essa medição como regressão.
