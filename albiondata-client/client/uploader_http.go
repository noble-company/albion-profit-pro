package client

import (
	"bytes"
	"fmt"
	"io"
	"io/ioutil"
	"net/http"
	"strings"
	"time"

	"github.com/ao-data/albiondata-client/log"
)

// PATCH LOCAL (Albion Profit Pro): teto por requisicao. Sem isso o http.Client nao tem
// timeout nenhum e o http.Transport tambem e pelado -- combinado com router.go, que dispara
// uma goroutine por operacao sem limite, um backend travado faz o client vazar goroutine e
// socket ate morrer de exaustao de memoria.
const ingestRequestTimeout = 30 * time.Second

type httpUploader struct {
	baseURL   string
	transport *http.Transport
	// PATCH LOCAL (Albion Profit Pro): vazio = nao envia Authorization. So destinos
	// marcados com o esquema "+token" preenchem isso -- ver newHTTPUploaderAuth.
	apiToken string
}

// newHTTPUploader creates a new HTTP uploader
func newHTTPUploader(url string) uploader {
	return &httpUploader{
		baseURL:   url,
		transport: &http.Transport{},
	}
}

// newHTTPUploaderAuth cria um uploader autenticado para o ingest do Albion Profit Pro.
//
// PATCH LOCAL (Albion Profit Pro): o marcador "+token" e removido da URL antes de qualquer
// requisicao sair -- mesmo padrao do "+pow" (uploader_http_pow.go). O esquema existe para
// que o token seja anexado SO aos nossos destinos: o -i aceita lista separada por virgula,
// e sem essa marcacao adicionar um segundo destino depois mandaria o nosso token de ingest
// junto para um terceiro.
func newHTTPUploaderAuth(url string) uploader {
	url = strings.Replace(url, "https+token", "https", -1)
	url = strings.Replace(url, "http+token", "http", -1)

	return &httpUploader{
		baseURL:   url,
		transport: &http.Transport{},
		apiToken:  ConfigGlobal.ApiToken,
	}
}

func (u *httpUploader) sendToIngest(body []byte, topic string, state *albionState, identifier string) {
	// not handling sending identifier since the official usage is with http_pow

	client := &http.Client{Transport: u.transport, Timeout: ingestRequestTimeout}

	fullURL := u.baseURL + "/" + topic

	req, err := http.NewRequest("POST", fullURL, bytes.NewBuffer([]byte(body)))
	if err != nil {
		log.Errorf("Error while create new request: %v", err)
		return
	}

	req.Header.Set("Content-Type", "application/json")
	// PATCH LOCAL (Albion Profit Pro): o uploader pow ja mandava User-Agent, o http puro
	// nao -- sem isso nao da para saber, do lado do servidor, qual versao de client mandou
	// o dado (necessario quando um patch do jogo quebrar o contrato).
	req.Header.Set("User-Agent", fmt.Sprintf("albiondata-client/%v", version))
	// PATCH LOCAL (Albion Profit Pro): so destinos "+token" tem apiToken preenchido.
	if u.apiToken != "" {
		req.Header.Set("Authorization", "Bearer "+u.apiToken)
	}

	resp, err := client.Do(req)
	if err != nil {
		log.Errorf("Error while sending ingest with data: %v", err)
		return
	}
	// PATCH LOCAL (Albion Profit Pro): o defer estava no fim da funcao, entao o return do
	// status ruim (abaixo) pulava o Close e vazava a conexao -- justamente no caminho de
	// erro, que e quando o client mais precisa sobreviver.
	defer resp.Body.Close()

	// PATCH LOCAL (Albion Profit Pro): faixa 2xx em vez de == 200, e o log passa a dizer
	// QUAL destino e QUAL topico falhou (com 6 topicos publicos, "bad response code: 404"
	// sozinho nao identifica nada).
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		log.Errorf("Got bad response code: %v (url: %v, topic: %v)", resp.StatusCode, u.baseURL, topic)
		return
	}

	// See: https://stackoverflow.com/questions/17948827/reusing-http-connections-in-golang
	io.Copy(ioutil.Discard, resp.Body)

	log.Infof("Successfully sent ingest request to %v", u.baseURL)
}
