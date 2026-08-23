package client

import "testing"

// PATCH LOCAL (Albion Profit Pro): cobertura da task 01 (docs/tasks/client/).
//
// A precedencia do token e sutil por causa da ordem do SetupFlags(): o viper e lido em
// setupWebsocketFlags(), ANTES das flags existirem, e o flag.Parse() so acontece depois.
// Resolver a precedencia no lugar errado faz o default vazio da flag apagar o valor que
// veio do config.yaml -- silenciosamente, e o sintoma seria um 401 no ingest.
// resolveApiToken() isola essa decisao pra ela poder ser testada sem mexer no
// flag.CommandLine global.

func TestResolveApiToken(t *testing.T) {
	casos := []struct {
		nome       string
		fromFlag   string
		fromFile   string
		wantToken  string
		wantOrigem string
	}{
		{
			nome:       "flag vence o arquivo",
			fromFlag:   "apk_daflag",
			fromFile:   "apk_doarquivo",
			wantToken:  "apk_daflag",
			wantOrigem: "flag -token",
		},
		{
			nome:       "arquivo usado quando a flag esta vazia",
			fromFlag:   "",
			fromFile:   "apk_doarquivo",
			wantToken:  "apk_doarquivo",
			wantOrigem: "config.yaml",
		},
		{
			nome:       "flag usada quando nao ha arquivo",
			fromFlag:   "apk_daflag",
			fromFile:   "",
			wantToken:  "apk_daflag",
			wantOrigem: "flag -token",
		},
		{
			nome:       "ambos vazios nao inventa token nem origem",
			fromFlag:   "",
			fromFile:   "",
			wantToken:  "",
			wantOrigem: "",
		},
	}

	for _, caso := range casos {
		t.Run(caso.nome, func(t *testing.T) {
			token, origem := resolveApiToken(caso.fromFlag, caso.fromFile)
			if token != caso.wantToken {
				t.Errorf("token = %q, esperado %q", token, caso.wantToken)
			}
			if origem != caso.wantOrigem {
				t.Errorf("origem = %q, esperado %q", origem, caso.wantOrigem)
			}
		})
	}
}

// tokenSufixo existe pra permitir diagnosticar "qual token esta carregado" sem escrever o
// valor no albiondata-client.log. Se ele devolver o token inteiro pra entrada curta, o
// proposito se perde.
func TestTokenSufixo(t *testing.T) {
	casos := []struct {
		token string
		want  string
	}{
		{"apk_1234567890abcdef", "cdef"},
		{"abcd", "abcd"},
		{"abc", "????"},
		{"", "????"},
	}

	for _, caso := range casos {
		if got := tokenSufixo(caso.token); got != caso.want {
			t.Errorf("tokenSufixo(%q) = %q, esperado %q", caso.token, got, caso.want)
		}
	}
}

// Guarda de regressao: o campo tem que existir no struct e ser acessivel como
// ConfigGlobal.ApiToken de qualquer arquivo do pacote -- e assim que a task 02 vai ler o
// token dentro do uploader, sem passa-lo por parametro.
func TestApiTokenAcessivelPeloConfigGlobal(t *testing.T) {
	anterior := ConfigGlobal.ApiToken
	defer func() { ConfigGlobal.ApiToken = anterior }()

	ConfigGlobal.ApiToken = "apk_teste"
	if ConfigGlobal.ApiToken != "apk_teste" {
		t.Errorf("ConfigGlobal.ApiToken = %q, esperado %q", ConfigGlobal.ApiToken, "apk_teste")
	}
}
