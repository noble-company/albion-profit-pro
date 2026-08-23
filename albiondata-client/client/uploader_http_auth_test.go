package client

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// PATCH LOCAL (Albion Profit Pro): cobertura da task 02 (docs/tasks/client/).
//
// O ponto central e que o token so pode sair para destinos marcados com "+token". O -i
// aceita lista separada por virgula, entao um uploader que anexasse Authorization
// incondicionalmente mandaria o nosso token de ingest para qualquer terceiro configurado
// junto. Estes testes travam esse comportamento.

// requisicaoCapturada guarda o que o servidor de teste recebeu.
type requisicaoCapturada struct {
	authorization string
	userAgent     string
	contentType   string
	path          string
	recebeu       bool
}

// servidorDeTeste sobe um httptest.Server que grava a requisicao e responde com o status
// pedido. Devolve o servidor e o ponteiro para o que foi capturado.
func servidorDeTeste(t *testing.T, status int) (*httptest.Server, *requisicaoCapturada) {
	t.Helper()

	capturada := &requisicaoCapturada{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturada.recebeu = true
		capturada.authorization = r.Header.Get("Authorization")
		capturada.userAgent = r.Header.Get("User-Agent")
		capturada.contentType = r.Header.Get("Content-Type")
		capturada.path = r.URL.Path
		w.WriteHeader(status)
	}))
	t.Cleanup(srv.Close)

	return srv, capturada
}

// comApiToken troca ConfigGlobal.ApiToken e restaura no fim -- mesmo padrao de
// event_festivities_update_test.go, ja que ConfigGlobal e um singleton de pacote.
func comApiToken(t *testing.T, token string) {
	t.Helper()
	anterior := ConfigGlobal.ApiToken
	t.Cleanup(func() { ConfigGlobal.ApiToken = anterior })
	ConfigGlobal.ApiToken = token
}

func TestUploaderAuthEnviaAuthorizationERemoveMarcadorDaURL(t *testing.T) {
	srv, capturada := servidorDeTeste(t, http.StatusOK)
	comApiToken(t, "apk_secreto_1234")

	// simula o que createUploaders vai fazer na task 03: a URL chega com o marcador
	alvo := strings.Replace(srv.URL, "http://", "http+token://", 1)
	u := newHTTPUploaderAuth(alvo)

	u.sendToIngest([]byte(`{"Orders":[]}`), "marketorders.ingest", &albionState{}, "id-1")

	if !capturada.recebeu {
		t.Fatal("servidor nao recebeu requisicao -- o marcador +token provavelmente nao foi removido da URL")
	}
	if got, want := capturada.authorization, "Bearer apk_secreto_1234"; got != want {
		t.Errorf("Authorization = %q, esperado %q", got, want)
	}
	if got, want := capturada.path, "/marketorders.ingest"; got != want {
		t.Errorf("path = %q, esperado %q", got, want)
	}
	if strings.Contains(capturada.path, "+token") {
		t.Errorf("o marcador +token vazou para a URL da requisicao: %q", capturada.path)
	}
}

// O teste que importa de verdade: destino sem marcador NAO pode receber o token, mesmo
// com um token configurado globalmente.
func TestUploaderComumNuncaEnviaAuthorization(t *testing.T) {
	srv, capturada := servidorDeTeste(t, http.StatusOK)
	comApiToken(t, "apk_secreto_1234")

	u := newHTTPUploader(srv.URL)
	u.sendToIngest([]byte(`{"Orders":[]}`), "marketorders.ingest", &albionState{}, "id-1")

	if !capturada.recebeu {
		t.Fatal("servidor nao recebeu requisicao")
	}
	if capturada.authorization != "" {
		t.Errorf("destino sem marcador +token recebeu Authorization = %q -- token vazou", capturada.authorization)
	}
}

func TestUploaderAuthComTokenVazioNaoMandaHeader(t *testing.T) {
	srv, capturada := servidorDeTeste(t, http.StatusOK)
	comApiToken(t, "")

	alvo := strings.Replace(srv.URL, "http://", "http+token://", 1)
	u := newHTTPUploaderAuth(alvo)
	u.sendToIngest([]byte(`{}`), "marketorders.ingest", &albionState{}, "id-1")

	if !capturada.recebeu {
		t.Fatal("servidor nao recebeu requisicao")
	}
	// nem header vazio, nem "Bearer " pendurado
	if capturada.authorization != "" {
		t.Errorf("Authorization = %q, esperado vazio quando nao ha token", capturada.authorization)
	}
}

func TestUploaderMandaUserAgentEContentType(t *testing.T) {
	srv, capturada := servidorDeTeste(t, http.StatusOK)

	u := newHTTPUploader(srv.URL)
	u.sendToIngest([]byte(`{}`), "marketorders.ingest", &albionState{}, "id-1")

	if !strings.HasPrefix(capturada.userAgent, "albiondata-client/") {
		t.Errorf("User-Agent = %q, esperado prefixo %q", capturada.userAgent, "albiondata-client/")
	}
	if got, want := capturada.contentType, "application/json"; got != want {
		t.Errorf("Content-Type = %q, esperado %q", got, want)
	}
}

// 204 e sucesso (faixa 2xx). Antes so 200 passava, o que amarrava o client a um detalhe
// de implementacao do servidor.
func TestUploaderAceitaFaixa2xx(t *testing.T) {
	for _, status := range []int{http.StatusOK, http.StatusCreated, http.StatusAccepted, http.StatusNoContent} {
		srv, capturada := servidorDeTeste(t, status)
		u := newHTTPUploader(srv.URL)
		u.sendToIngest([]byte(`{}`), "marketorders.ingest", &albionState{}, "id-1")
		if !capturada.recebeu {
			t.Errorf("status %d: servidor nao recebeu requisicao", status)
		}
	}
}

// Caminho de erro: nao pode panicar. O vazamento de conexao que existia aqui (return antes
// do defer Close) nao e observavel diretamente de um teste; o que da para travar e que o
// caminho de erro roda inteiro sem derrubar o client.
func TestUploaderNaoPanicaEmStatusDeErro(t *testing.T) {
	for _, status := range []int{http.StatusUnauthorized, http.StatusNotFound, http.StatusTooManyRequests, http.StatusInternalServerError} {
		srv, _ := servidorDeTeste(t, status)
		u := newHTTPUploader(srv.URL)
		u.sendToIngest([]byte(`{}`), "marketorders.ingest", &albionState{}, "id-1")
	}
}

// Destino inalcancavel: tambem nao pode panicar nem travar (o timeout existe justamente
// para isso). Porta 1 nao tem nada escutando.
func TestUploaderNaoPanicaComDestinoInalcancavel(t *testing.T) {
	u := newHTTPUploader("http://127.0.0.1:1")
	u.sendToIngest([]byte(`{}`), "marketorders.ingest", &albionState{}, "id-1")
}

// Guarda de regressao do timeout: se alguem remover o Timeout do http.Client, este teste
// nao falha sozinho -- mas a constante some e o build quebra. Aqui so afirmamos que o valor
// e diferente de zero, que e a diferenca entre "espera para sempre" e "desiste".
func TestTimeoutDeIngestNaoEZero(t *testing.T) {
	if ingestRequestTimeout <= 0 {
		t.Fatalf("ingestRequestTimeout = %v -- sem timeout, um backend travado prende a goroutine para sempre", ingestRequestTimeout)
	}
}
