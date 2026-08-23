package client

import (
	"strings"
	"testing"
)

// PATCH LOCAL (Albion Profit Pro): cobertura da task 03 (docs/tasks/client/).
//
// createUploaders tinha um panic latente: a guarda validava len(target) < 4 mas as
// comparacoes fatiavam target[0:8] e target[0:9]. Qualquer destino de 4 a 8 caracteres
// estourava "slice bounds out of range" -- medido antes da correcao:
//
//	"noop"     -> panic [:8] com length 4   (e "noop" e anunciado como valido no help do -i)
//	"http://x" -> panic [:9] com length 8   (URL curta, mas perfeitamente valida)
//	"nats://x" -> panic [:9] com length 8
//
// Como createUploaders roda a cada mensagem (dispatcher.go), um destino mal configurado
// derrubaria o client no primeiro dado capturado.

// tipoDoUploader identifica a implementacao escolhida sem expor detalhe interno nos testes.
func tipoDoUploader(u uploader) string {
	switch v := u.(type) {
	case *httpUploader:
		if v.apiToken != "" {
			return "http+auth"
		}
		return "http"
	case *httpUploaderPow:
		return "pow"
	case *natsUploader:
		return "nats"
	default:
		return "desconhecido"
	}
}

func TestCreateUploadersNaoPanicaComDestinosCurtos(t *testing.T) {
	// a regressao exata: tudo entre 1 e 9 caracteres costumava panicar
	var curtos []string
	for _, s := range []string{"n", "no", "noo", "noop", "http", "https", "nats", "abcde", "http://x", "nats://x", "ftp://ab"} {
		curtos = append(curtos, s)
	}

	for _, alvo := range curtos {
		t.Run(alvo, func(t *testing.T) {
			defer func() {
				if r := recover(); r != nil {
					t.Fatalf("createUploaders panicou com %q: %v", alvo, r)
				}
			}()
			createUploaders([]string{alvo})
		})
	}
}

func TestCreateUploadersEscolheOUploaderCerto(t *testing.T) {
	// token nao-vazio pra conseguir distinguir http+auth de http comum
	anterior := ConfigGlobal.ApiToken
	t.Cleanup(func() { ConfigGlobal.ApiToken = anterior })
	ConfigGlobal.ApiToken = "apk_teste"

	casos := []struct {
		alvo string
		want string
	}{
		{"http+token://localhost:8000", "http+auth"},
		{"https+token://api.example.com", "http+auth"},
		{"http+pow://localhost:3000", "pow"},
		{"https+pow://albion-online-data.com", "pow"},
		{"http://localhost:9099", "http"},
		{"https://api.example.com", "http"},
	}

	for _, caso := range casos {
		t.Run(caso.alvo, func(t *testing.T) {
			us := createUploaders([]string{caso.alvo})
			if len(us) != 1 {
				t.Fatalf("createUploaders(%q) devolveu %d uploaders, esperado 1", caso.alvo, len(us))
			}
			if got := tipoDoUploader(us[0]); got != caso.want {
				t.Errorf("createUploaders(%q) -> %s, esperado %s", caso.alvo, got, caso.want)
			}
		})
	}
}

// nats:// abre conexao de verdade no construtor, entao nao entra no teste acima junto dos
// outros -- aqui so confirmamos que o ramo existe e nao panica.
func TestCreateUploadersReconheceNats(t *testing.T) {
	defer func() {
		if r := recover(); r != nil {
			t.Fatalf("createUploaders panicou com destino nats: %v", r)
		}
	}()
	createUploaders([]string{"nats://localhost:4222"})
}

func TestCreateUploadersNoopNaoGeraUploader(t *testing.T) {
	us := createUploaders([]string{"noop"})
	if len(us) != 0 {
		t.Errorf("noop gerou %d uploaders, esperado 0", len(us))
	}
}

func TestCreateUploadersIgnoraVazioEInvalido(t *testing.T) {
	casos := []string{"", "   ", "ftp://x.example.com", "sei-la-o-que"}
	for _, alvo := range casos {
		us := createUploaders([]string{alvo})
		if len(us) != 0 {
			t.Errorf("destino %q gerou %d uploaders, esperado 0", alvo, len(us))
		}
	}
}

// O -i aceita lista separada por virgula, e strings.Split nao apara espaco. Sem TrimSpace,
// "a, b" vira o destino " b" e some sem explicacao util.
func TestCreateUploadersAparaEspacoEmListaComVirgula(t *testing.T) {
	anterior := ConfigGlobal.ApiToken
	t.Cleanup(func() { ConfigGlobal.ApiToken = anterior })
	ConfigGlobal.ApiToken = "apk_teste"

	entrada := "http+token://localhost:8000, http://localhost:9099"
	us := createUploaders(strings.Split(entrada, ","))

	if len(us) != 2 {
		t.Fatalf("esperado 2 uploaders, veio %d -- o espaco depois da virgula provavelmente nao foi aparado", len(us))
	}
	if got := tipoDoUploader(us[0]); got != "http+auth" {
		t.Errorf("uploader[0] = %s, esperado http+auth", got)
	}
	// o segundo destino nao tem marcador +token: nao pode receber o token
	if got := tipoDoUploader(us[1]); got != "http" {
		t.Errorf("uploader[1] = %s, esperado http (sem token) -- token vazando para destino de terceiro", got)
	}
}

// Guarda do default: se alguem reverter o -i para a comunidade sem querer, o dado para de
// chegar no nosso backend e ninguem percebe ate olhar o banco.
//
// Afirma sobre a constante, e nao sobre ConfigGlobal.PublicIngestBaseUrls: SetupFlags() e
// chamado do init() do pacote main, que nao roda em `go test ./client/` -- ali o campo fica
// no zero value e o teste passaria/falharia por motivo errado.
func TestDefaultDoIngestApontaParaNosso(t *testing.T) {
	if !strings.HasPrefix(defaultPublicIngestBaseURL, "http+token://") {
		t.Errorf("default do -i = %q, esperado prefixo http+token:// (destino autenticado do Albion Profit Pro)",
			defaultPublicIngestBaseURL)
	}

	// o default tem que ser reconhecido pelo proprio createUploaders, senao o client sobe
	// com um destino que ele mesmo nao sabe usar
	anterior := ConfigGlobal.ApiToken
	t.Cleanup(func() { ConfigGlobal.ApiToken = anterior })
	ConfigGlobal.ApiToken = "apk_teste"

	us := createUploaders([]string{defaultPublicIngestBaseURL})
	if len(us) != 1 {
		t.Fatalf("createUploaders(default) devolveu %d uploaders, esperado 1", len(us))
	}
	if got := tipoDoUploader(us[0]); got != "http+auth" {
		t.Errorf("default do -i gerou uploader %s, esperado http+auth", got)
	}
}
