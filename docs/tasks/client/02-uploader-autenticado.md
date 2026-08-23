# 02 — Uploader autenticado e robusto

## Objetivo
Fazer o client mandar `Authorization: Bearer <token>` **só** pros destinos que são nossos, via o
pseudo-esquema `http+token://` — e, de quebra, corrigir os três defeitos do uploader HTTP puro que
passam despercebidos contra o ingest da comunidade mas nos mordem com backend próprio.

## Por que

### Por que um esquema novo, e não "sempre manda o header"

O `-i` aceita **lista de URLs separada por vírgula** (`client/config.go:229`). Se o header for
anexado incondicionalmente em `httpUploader`, no dia em que alguém configurar um segundo destino
(voltar a contribuir com a comunidade, apontar pra um ambiente de staging, o que for) **o nosso
token de API vai junto pra esse terceiro**. Token de ingest dá acesso de escrita à conta — não
pode vazar por configuração acidental.

O codebase já resolve exatamente esse problema com `https+pow://`: um marcador de esquema que só
existe do lado do client, usado pra escolher o uploader (`client/dispatcher.go:41`) e removido da
URL antes de qualquer requisição sair (`client/uploader_http_pow.go:42-43`). Replicar o padrão
custa ~6 linhas, é auto-documentado na config do usuário, e torna impossível vazar o token por
engano: sem `+token` na URL, sem header.

### Os três defeitos do `httpUploader`

Todos existem no upstream e são inofensivos contra o ingest público (que fica atrás de CDN e sempre
responde 200). Contra o nosso backend, não:

1. **`http.Client` sem `Timeout` nenhum** (`client/uploader_http.go:28`) — e o `http.Transport` da
   linha 21 também é pelado (sem `DialContext`, `TLSHandshakeTimeout` ou `ResponseHeaderTimeout`).
   Combinado com `client/router.go:52`, que dispara **uma goroutine por operação sem limite
   nenhum**, um backend travado (ou o Docker Desktop pausado) faz o client vazar goroutine e socket
   indefinidamente, até morrer de exaustão de memória. Este é o mais grave dos três.
2. **Só aceita HTTP 200** (`client/uploader_http.go:46`) e o `return` da linha 48 acontece **antes**
   do `defer resp.Body.Close()` ser registrado na linha 56 — toda resposta não-200 vaza a conexão.
   Nosso backend devolve 200 no caminho feliz, mas devolve 401 (token errado), 422 (payload fora do
   contrato), 429 (rate limit) e 404 nos tópicos que não implementamos (achado `F5`, task 04). Ou
   seja: **é exatamente no cenário de erro, que é quando o usuário mais precisa que o client
   sobreviva, que ele vaza recurso.**
3. **Não manda `User-Agent`** — o uploader pow manda (`uploader_http_pow.go:57,94`), o http puro
   não. Sem isso não conseguimos saber, do lado do servidor, qual versão de client está mandando
   dado — e vamos precisar disso quando um patch do jogo quebrar o contrato.

## O que implementar

### Token no struct do uploader

Reusar o `httpUploader` que já existe em vez de criar um tipo novo — a única diferença é o header:

```go
type httpUploader struct {
	baseURL   string
	transport *http.Transport
	apiToken  string // vazio = nao envia Authorization (destino de terceiro)
}

func newHTTPUploader(url string) uploader {
	return &httpUploader{baseURL: url, transport: &http.Transport{}}
}

// PATCH LOCAL (Albion Profit Pro): destino autenticado do nosso backend. O marcador
// "+token" e removido da URL antes de qualquer requisicao sair -- mesmo padrao do
// "+pow" (uploader_http_pow.go:42-43). So destinos marcados recebem o token.
func newHTTPUploaderAuth(url string) uploader {
	url = strings.Replace(url, "https+token", "https", -1)
	url = strings.Replace(url, "http+token", "http", -1)

	return &httpUploader{
		baseURL:   url,
		transport: &http.Transport{},
		apiToken:  ConfigGlobal.ApiToken,
	}
}
```

`ConfigGlobal` é global de pacote (`client/config.go:75`), acessível direto — não precisa ser
passado por parâmetro.

### `sendToIngest` — header, timeout, status, close

Em `client/uploader_http.go:25-58`:

```go
	client := &http.Client{
		Transport: u.transport,
		// PATCH LOCAL (Albion Profit Pro): sem timeout, um backend travado prende a
		// goroutine pra sempre -- e router.go:52 cria uma goroutine por operacao.
		Timeout: 30 * time.Second,
	}

	// ...

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", fmt.Sprintf("albiondata-client/%v", version))
	if u.apiToken != "" {
		req.Header.Set("Authorization", "Bearer "+u.apiToken)
	}

	resp, err := client.Do(req)
	if err != nil {
		log.Errorf("Error while sending ingest with data: %v", err)
		return
	}
	defer resp.Body.Close()   // <- ANTES de qualquer return por status

	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		log.Errorf("Got bad response code: %v (url: %v, topic: %v)", resp.StatusCode, u.baseURL, topic)
		return
	}
```

`version` é var de pacote em `client` (`client/client.go:10`), a mesma que o uploader pow usa.

Três detalhes que importam:
- `defer resp.Body.Close()` sobe pra logo depois do `err` — corrige o vazamento do defeito 2.
- Faixa `2xx` em vez de `== 200` — nosso backend devolve 200 hoje, mas isso deixa de ser uma
  amarração desnecessária.
- O log de erro passa a incluir **URL e tópico**. Sem isso, "Got bad response code: 404" não diz
  qual dos seis tópicos falhou, que é exatamente a informação necessária (achado `F5`).

**Não logar o token** — nem no erro, nem no debug. Ver task 01.

### Token ausente

Se `ApiToken` estiver vazio e o destino for `+token`, o header simplesmente não é setado e o
backend devolve 401. Isso é aceitável aqui — a task 04 adiciona a verificação de token no boot, que
é onde o usuário recebe a mensagem clara. Não vale duplicar a validação nas duas pontas.

## Bibliotecas/dependências
Nenhuma nova. `time`, `fmt` e `strings` são stdlib (`strings` já é importado no uploader pow).

## Depende de
Task 01 (o campo `ConfigGlobal.ApiToken` precisa existir).

> A ligação de `http+token://` em `createUploaders` fica na **task 03**, junto com a correção do
> panic (`F4`) na mesma função — não faz sentido mexer em `createUploaders` duas vezes.

## Testes manuais
1. `go build ./...`.
2. Subir `backend/scripts/capture_sink.py` com um print temporário dos headers recebidos; rodar
   `./albiondata-client.exe -i "http+token://localhost:9099" -token apk_teste -debug` e confirmar
   no sink que chega `Authorization: Bearer apk_teste` e que a URL do POST **não** tem `+token`.
3. Rodar com `-i "http://localhost:9099"` (sem `+token`) → o sink **não** recebe `Authorization`.
4. Apontar pra uma porta onde nada escuta e confirmar que o client loga erro e segue vivo
   (não trava, não vaza goroutine) — 30s de timeout por requisição.

> ⚠️ **Os itens 2-4 não são executáveis nesta task** — descoberto na implementação. Dois motivos:
> (a) `createUploaders` ainda não reconhece `http+token://` (é a task 03), então esse `-i` cai no
> ramo `target[0:4] == "http"` e cria um uploader **comum** com o marcador ainda na URL, que falha
> com "unsupported protocol scheme"; (b) mesmo com a task 03 pronta, o client só faz upload quando
> há tráfego de jogo, e não existe `.gob` gravado no repo pra replay offline (e o modo `-o` força
> `DisableUpload` de qualquer forma, `config.go:87-97`).
> As mesmas asserções estão cobertas em nível de unidade por `httptest` em
> `client/uploader_http_auth_test.go`. A verificação ponta a ponta com o sink é da **task 03**
> (item 3 dos testes manuais de lá) e da **task 10**.

## Testes automatizados
Padrão de `client/event_festivities_update_test.go:124-138` (salva/restaura `ConfigGlobal`).
Usar `net/http/httptest` pra subir um servidor de teste e inspecionar o request recebido:

- Destino `http+token://` com token setado → request chega com `Authorization: Bearer <token>` e a
  URL de destino **não** contém `+token`.
- Destino `http://` (sem marcador) → request chega **sem** `Authorization`.
- Token vazio + destino `+token` → request chega sem `Authorization` (não panica, não manda
  `"Bearer "` vazio).
- Servidor devolvendo 500 → o client loga e retorna sem panicar; o corpo é fechado (verificável
  afirmando que o servidor de teste não acumula conexão pendente).
- Servidor devolvendo 204 → tratado como sucesso (faixa 2xx), não como erro.
- `User-Agent` presente e no formato `albiondata-client/<versao>`.

---

## Notas de implementação (2026-08-23) — task concluída

- **`httpUploader` reusado**, com um campo `apiToken` a mais, em vez de um tipo novo — a única
  diferença entre os dois destinos é o header, e `sendToIngest` é idêntico. `newHTTPUploaderAuth`
  é o único construtor que preenche o campo.
- **Timeout virou constante nomeada** `ingestRequestTimeout` (30s) em vez de literal, pra o teste
  de regressão poder afirmar sobre ela.
- **O log de erro de status ganhou `url` e `topic`.** Com 6 tópicos públicos indo pro mesmo
  destino, `Got bad response code: 404` sozinho não identifica o que falhou — e é exatamente esse
  log que o usuário vai colar quando pedir ajuda.
- **Vazamento confirmado antes de corrigir**: o `defer resp.Body.Close()` estava na última linha
  da função, depois do `return` do status ruim — toda resposta não-2xx vazava a conexão. O `defer`
  subiu pra logo depois do `client.Do`.
- **`io/ioutil` (deprecado) foi mantido** — trocar por `io.Discard` seria refatoração oportunista,
  fora do escopo desta task e ruído de diff contra o upstream.
- **Nada chama `newHTTPUploaderAuth` ainda** — a ligação em `createUploaders` é da task 03, como a
  seção "Depende de" já previa. Em Go função não usada não quebra o build; os testes a exercitam
  diretamente.
- Arquivo de teste novo criado em **CRLF**, seguindo a convenção da fase
  ([README.md](README.md#convenções-específicas-desta-fase)).
