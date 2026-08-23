# 08 — DTO, tópico e dispatch de craft

> # ❌ DESCOPADA (2026-08-23) — não implementar
>
> Depende da task 07, também descopada. A calculadora é ferramenta de **planejamento** e nenhum
> insumo do cálculo vem de evento de craft. Racional completo em
> [README.md](README.md#por-que-07-09-foram-descopadas-2026-08-23).

## Objetivo
Criar o DTO de upload e o tópico novo, e ligar o `Process` dos handlers da task 07 ao dispatcher —
fechando o caminho do evento até o POST HTTP.

## Por que

O padrão do projeto pra um tópico novo é conhecido e pequeno (doc 01 §8, passos 4 e 5): um struct
em `lib/` com tags JSON, uma constante em `lib/nats.go`, e uma chamada a `sendMsgToPublicUploaders`
dentro do `Process`. `lib/festivities.go` + `client/event_festivities_update.go:40` são o exemplo
completo.

### Por que o canal público, se craft é dado pessoal

A leitura natural seria usar `sendMsgToPrivateUploaders`: craft é do usuário, e o caminho privado
ainda stampa `CharacterId`/`CharacterName` de graça via `upload.Personalize(...)`
(`client/dispatcher.go:95`), que é exatamente a informação de atribuição que queremos.

**Mas há uma armadilha que inviabiliza isso.** `sendMsgToPublicUploaders` manda o dado público pra
**as duas** listas de uploader (`client/dispatcher.go:69-73`):

```go
	var publicUploaders = createUploaders(strings.Split(PublicIngestBaseUrls, ","))
	var privateUploaders = createUploaders(strings.Split(ConfigGlobal.PrivateIngestBaseUrls, ","))

	sendMsgToUploaders(data, topic, publicUploaders, state, identifier)
	sendMsgToUploaders(data, topic, privateUploaders, state, identifier)
```

Usar o canal privado exigiria configurar o `-p` apontando pro nosso backend — e aí **todo payload
de mercado passaria a chegar duplicado**, porque o caminho público fana out pras duas listas.
Isso queima 2× o rate limit de 120/min (`backend/src/ingest/router.py:15`) sem nenhum ganho: o
upsert do backend absorveria a duplicata, mas é desperdício puro de rede e de fila.

Então: **`-p` fica vazio** (decisão da task 03), craft sobe pelo canal público, e o DTO carrega
`CharacterId`/`CharacterName` **explicitamente**. Os dois valores estão disponíveis em `state`
dentro do `Process` (`client/albion_state.go:25-26`) — não precisamos da maquinaria de
`Personalize` pra isso.

Vale lembrar que a atribuição ao **usuário** (a conta do Albion Profit Pro) já vem do token de API
no header, resolvida pelo backend em `require_api_token`. O `CharacterId` resolve um problema
diferente e real: **um usuário pode ter vários personagens**, e vai querer saber qual deles
produziu o quê.

## O que implementar

### DTO em `lib/craft.go`

Padrão de `lib/festivities.go`. Campos exatos saem da task 06; a forma geral:

```go
package lib

// CraftEvent representa uma producao (craft ou refino) concluida pelo jogador local.
type CraftEvent struct {
	// atribuicao -- ver "Por que" acima: carregado explicitamente em vez de via
	// PrivateUpload/Personalize, pra manter o -p vazio e evitar envio duplicado.
	CharacterId   CharacterID `json:"CharacterId"`
	CharacterName string      `json:"CharacterName"`

	StationId  int    `json:"StationId"`
	ItemId     int    `json:"ItemId"`
	Amount     int    `json:"Amount"`
	// ... conforme confirmado na task 06
}

type CraftEventUpload struct {
	Events []*CraftEvent `json:"Events"`
}
```

Duas convenções obrigatórias do projeto:

- **Tags JSON em PascalCase**, como todo o resto do `lib/` (`lib/market.go:5-17`). O backend espelha
  isso via `Field(alias=...)` no Pydantic — nunca renomeia pra snake_case no fio
  (`CLAUDE.md`, "Match the Go client's wire contract exactly").
- **Sem `omitempty`** — nenhum struct de `lib/` usa, e o backend conta com todas as chaves
  presentes.

Cuidado com armadilha já vista no `lib/`: `MarketHistoriesUpload` tem campo Go `Histories` mas
chave JSON `MarketHistories`, e `GoldPricesUpload` tem `TimeStamps` mapeado pra `Timestamps`. Não
repetir esse tipo de descasamento sem necessidade — nome do campo Go igual à chave JSON.

### Constante de tópico

`lib/nats.go`, no bloco de tópicos públicos:

```go
	// Public Topics
	// ...
	NatsCraftEventIngest = "craftevents.ingest"
```

O nome do tópico vira o **último segmento da URL** (`{base}/{topic}` em
`client/uploader_http.go:30`), então o backend tem que expor exatamente
`POST /craftevents.ingest` (task 09).

> Este tópico é **nosso**, não existe no upstream. Marcar com `PATCH LOCAL (Albion Profit Pro)`
> conforme a convenção da fase — é o tipo de linha que gera conflito de rebase e a pessoa que
> resolver precisa saber que é adição nossa.

### Dispatch

No `Process` dos handlers da task 07, o padrão de `client/event_festivities_update.go:36-40`:

```go
	identifier, _ := uuid.NewV4()
	log.Infof("Sending %d craft events to ingest (Identifier: %s)", len(upload.Events), identifier)
	sendMsgToPublicUploaders(upload, lib.NatsCraftEventIngest, state, identifier.String())
```

### Efeito colateral gratuito: WebSocket local

`sendMsgToPublicUploaders` também espelha no WebSocket local quando `EnableWebsockets` está ligado
(`client/dispatcher.go:76-78`), envelopando como `{"topic": "...", "data": {...}}`. O tópico novo
passa a estar disponível em `ws://localhost:8099/ws` sem nenhum trabalho extra — é o gancho que o
doc 01 §7 recomenda pra consumo local de baixa latência, útil pra Fase 3/4.

## Bibliotecas/dependências
Nenhuma nova.

## Depende de
Tasks 06 (formato do payload) e 07 (os handlers que chamam isto).

Precisa ser combinada com a **task 09** pra ter efeito visível — sem a rota no backend, o POST
volta 404. Fazer 09 antes ou junto.

## Testes manuais
1. `go build ./...`.
2. Subir `backend/scripts/capture_sink.py`; rodar o client com
   `-i "http+token://localhost:9099" -token apk_teste`; refinar algo no jogo → o sink grava um
   arquivo `craftevents-captura-*.json` (o sink nomeia pelo tópico).
3. Conferir no JSON gravado: chaves em PascalCase, `CharacterId`/`CharacterName` preenchidos,
   quantidade batendo com o que foi produzido.
4. Com `EnableWebsockets: true` no `config.yaml`, conectar em `ws://localhost:8099/ws` e confirmar
   que o tópico novo chega envelopado.

## Testes automatizados
- Serialização: `json.Marshal(CraftEventUpload{...})` produz exatamente as chaves esperadas
  (afirmar sobre o JSON, não sobre o struct — é o contrato de fio que importa).
- `CharacterId`/`CharacterName` são propagados de `albionState` pro upload.
- Round-trip: o JSON gerado aqui valida contra o schema Pydantic da task 09. Na prática isso é
  garantido versionando o payload gerado em `backend/tests/fixtures/wire/` e fazendo o teste do
  backend ler **esse mesmo arquivo** — o padrão que a task 36 do backend estabeleceu, e a defesa
  contra os dois lados divergirem em silêncio.
