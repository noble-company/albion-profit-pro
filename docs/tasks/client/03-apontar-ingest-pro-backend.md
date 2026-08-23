# 03 — Apontar o ingest pro nosso backend

> Corrige os achados **F1**, **F4** e **F6** de [README.md](README.md), e as correções de doc de
> **F1**, **F2** e **F6**.

## Objetivo
Ligar o esquema `http+token://` no seletor de uploader, trocar o destino padrão de ingest pro nosso
backend, e corrigir o panic latente que mora na mesma função.

## Por que

### `-i`, não `-p` (achado F1)

O plano macro (Fase 2, item 3) e o `CLAUDE.md` mandam apontar o **`-p`** (ingest privado) pro nosso
backend. **Isso está errado e não traria nenhum dado de mercado.** Os quatro handlers que produzem
o que a calculadora precisa chamam `sendMsgToPublicUploaders`:

| Tópico | Call site |
|---|---|
| `marketorders.ingest` | `client/operation_auction_get_offers.go:96` |
| `marketorders.ingest` | `client/operation_auction_get_requests.go:46` |
| `markethistories.ingest` | `client/operation_auction_get_item_average_stats.go:125` |
| `goldprices.ingest` | `client/operation_gold_market_get_average_info.go:31` |

O canal privado (`-p`) só carrega `skills` e `marketnotifications`
(`client/event_skill_data.go:49`, `client/operation_read_mail.go:49`).

**E o `-p` tem que continuar vazio.** `sendMsgToPublicUploaders` manda o dado público pra **as
duas** listas de uploader (`client/dispatcher.go:72-73`):

```go
	sendMsgToUploaders(data, topic, publicUploaders, state, identifier)
	sendMsgToUploaders(data, topic, privateUploaders, state, identifier)
```

Se `-p` e `-i` apontarem pro mesmo lugar, **todo payload de mercado chega duplicado no nosso
backend**, queimando 2× o rate limit de 120/min (`backend/src/ingest/router.py:15`). O upsert do
backend absorveria sem corromper dado, mas é desperdício puro.

### O panic latente (achado F4)

`client/dispatcher.go:30-53`:

```go
		if len(target) < 4 {                        // linha 36 -- valida 4
			log.Infof("Got an ingest target that was less than 4 characters...")
			continue
		}

		if target[0:8] == "http+pow" ||  target[0:9] == "https+pow" {   // linha 41 -- fatia 9
```

Qualquer destino de 4 a 8 caracteres passa pela guarda e estoura `slice bounds out of range` na
linha seguinte. O valor `"noop"` — que o próprio texto de ajuda do `-i` anuncia como válido
(`client/config.go:229`) — tem 4 caracteres e **panica**. Vamos reescrever essa função de qualquer
forma pra ligar o `+token`; corrigir junto é de graça.

Na mesma função, `target[0:5] == "https"` (linha 43) é código morto: `target[0:4] == "http"` já
casa `https://...`.

### Consequência aceita: paramos de alimentar a comunidade

Decisão explícita do usuário (2026-08-23): o client passa a mandar **só** pro nosso backend. O
`-i` continua aceitando lista separada por vírgula, então voltar a contribuir depois é só
configuração — mas o default deixa de incluir o Albion Data Project.

## O que implementar

### `createUploaders` reescrita

`client/dispatcher.go:30-53`. Trocar as fatias por `strings.HasPrefix` (seguro em qualquer
tamanho, o que elimina a guarda de comprimento junto com o panic) e ligar o esquema novo:

```go
func createUploaders(targets []string) []uploader {
	var uploaders []uploader
	for _, target := range targets {
		target = strings.TrimSpace(target)
		if target == "" {
			continue
		}

		// PATCH LOCAL (Albion Profit Pro): HasPrefix no lugar de target[0:N]. A guarda
		// antiga validava len<4 mas fatiava [0:9] -- "noop", documentado no help do -i,
		// panicava com slice bounds out of range.
		switch {
		case strings.HasPrefix(target, "http+token://"), strings.HasPrefix(target, "https+token://"):
			uploaders = append(uploaders, newHTTPUploaderAuth(target))
		case strings.HasPrefix(target, "http+pow://"), strings.HasPrefix(target, "https+pow://"):
			uploaders = append(uploaders, newHTTPUploaderPow(target))
		case strings.HasPrefix(target, "http://"), strings.HasPrefix(target, "https://"):
			uploaders = append(uploaders, newHTTPUploader(target))
		case strings.HasPrefix(target, "nats://"):
			uploaders = append(uploaders, newNATSUploader(target))
		case target == "noop":
			// documentado no help do -i; descarta de proposito
		default:
			log.Infof("An invalid ingest target was specified: %v", target)
		}
	}

	return uploaders
}
```

A ordem dos `case` importa: os esquemas com marcador têm que ser testados **antes** do
`http://`/`https://` puro. Usar o prefixo completo com `://` (e não só `"http"`) evita ambiguidade.

O `TrimSpace` é defensivo — `strings.Split(urls, ",")` não apara espaço, e
`"a, b"` produziria o destino `" b"`, que hoje cai no `default` sem explicação clara.

### Default do `-i`

`client/config.go:225-230`:

```go
	flag.StringVar(
		&config.PublicIngestBaseUrls,
		"i",
		// PATCH LOCAL (Albion Profit Pro): era "https+pow://albion-online-data.com".
		// Aponta pro nosso backend; trocar pela URL de producao no deploy.
		"http+token://localhost:8000",
		"Base URL to send PUBLIC data to: 'http(s)+token://' (Albion Profit Pro, autenticado), 'http(s)+pow://', 'http(s)://', 'nats://' ou 'noop'. Comma separated.",
	)
```

**Não temos domínio de produção ainda**, então o default aponta pro ambiente de dev. Isso é
deliberado: o objetivo imediato desta fase é o teste local ponta a ponta. Trocar pela URL real é
item do deploy (plano macro, "Ordem de implementação" item 6).

O `-p` fica como está (vazio) — ver "Por que" acima.

### Efeito colateral esperado no placeholder mágico

`client/dispatcher.go:64-67` substitui o literal `https+pow://albion-online-data.com` pela URL
regional resolvida do IP do servidor de jogo. Com o default novo, essa substituição simplesmente
não dispara mais. **É o comportamento desejado** — mas vale saber que `state.AODataServerID`
continua sendo populado (`client/listener.go:154-157`), então o dado de qual servidor
(west/east/europe) continua disponível se um dia precisarmos (ver plano macro, Fase 2 item 7, e
task 27 do backend).

### Correções de documentação (parte da task)

Três documentos estão factualmente errados e a convenção do projeto (`docs/README.md`) é corrigir,
não deixar como registro histórico:

1. **`docs/00-plano-macro.md`**, Fase 2 item 3 — troca de `-p` por `-i`, com nota do porquê
   (achado `F1`).
2. **`CLAUDE.md`** — a tabela de status diz que o fork está *"mostly vanilla — still unmodified"*
   (achado `F2`), mas o patch do `N5` está aplicado desde 2026-08-22 em
   `client/operation_auction_get_offers.go:47`. Corrigir a descrição e o texto sobre `-p`.
3. **`docs/01-mapeamento-albiondata-client.md` §9.4** (achado `F6`) — afirma que com `-d` "o JSON
   nunca é serializado". Vale só pro caminho **privado** (`dispatcher.go:82`, que checa antes de
   marshalar); no caminho público o `json.Marshal` roda na linha 56, **antes** do gate em
   `sendMsgToUploaders` (linha 115). A conclusão prática do doc (`-d` não serve pra inspecionar
   payload) continua correta — só o mecanismo descrito está errado.

`docs/README.md` já lista `docs/tasks/client/` (feito na criação das tasks) — não precisa mexer.

## Bibliotecas/dependências
Nenhuma nova.

## Depende de
Task 02 (`newHTTPUploaderAuth` precisa existir).

## Testes manuais
1. `go build ./...`.
2. `./albiondata-client.exe -i "noop" -version` → **não panica** (antes da correção, panicava).
3. Subir `backend/scripts/capture_sink.py` na 9099; rodar
   `./albiondata-client.exe -i "http+token://localhost:9099" -token apk_teste -debug`; atravessar
   uma zona no jogo, abrir o mercado → o sink grava os POSTs com header de auth.
4. Rodar sem `-i` nenhum e confirmar no log que o destino default é o nosso backend, não mais
   `albion-online-data.com`.
5. `-i "http+token://localhost:9099, http://localhost:9098"` (com espaço) → os dois destinos são
   criados, só o primeiro leva `Authorization`.

## Testes automatizados
- `createUploaders` com `"noop"` → não panica, devolve lista vazia.
- `createUploaders` com destino de 1..8 caracteres arbitrários → não panica (tabela de casos).
- Cada esquema (`http+token://`, `https+token://`, `http+pow://`, `https+pow://`, `http://`,
  `https://`, `nats://`) devolve o tipo de uploader correto — afirmar via type assertion.
- Destino com espaço em volta é aparado e reconhecido.
- Lista mista devolve os uploaders na ordem certa.
- Destino inválido (`"ftp://x"`) → lista vazia, sem panic.

---

## Notas de implementação (2026-08-23) — task concluída

- **O panic foi confirmado empiricamente antes da correção**, num programa isolado replicando a
  lógica de `dispatcher.go:36-49`. É **pior** do que a spec dizia: além de `"noop"` (4 chars,
  panic em `[:8]`), qualquer URL curta e perfeitamente válida também estoura — `"http://x"` e
  `"nats://x"` (8 chars) panicam em `[:9]`. Como `createUploaders` roda **a cada mensagem**, um
  destino mal configurado derrubaria o client no primeiro dado capturado.
- **O default virou a constante `defaultPublicIngestBaseURL`** em vez de literal inline no
  `flag.StringVar`. Motivo descoberto na implementação: `SetupFlags()` é chamado do `init()` do
  pacote **`main`**, que **não roda** em `go test ./client/` — ali `ConfigGlobal.PublicIngestBaseUrls`
  fica no zero value (`""`) e o teste do default passaria ou falharia por motivo errado. O
  primeiro rascunho do teste falhou exatamente assim; a constante resolve.
- **`case target == "noop"`** foi incluído explicitamente. O help do `-i` sempre anunciou `noop`
  como válido, mas não havia ramo pra ele — caía no `else` (depois de panicar).
- **O teste manual #2 da spec (`-i "noop" -version`) é mais fraco do que parece**: com `-version`
  o `main` retorna antes de qualquer upload, e `createUploaders` só é chamado por mensagem — ou
  seja, ele verifica que o *startup* não quebra, não que o panic sumiu. A cobertura real do panic
  é o teste automatizado, que chama `createUploaders` direto com uma tabela de destinos curtos.
