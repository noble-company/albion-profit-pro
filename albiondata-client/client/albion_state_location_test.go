package client

import (
	"testing"
	"time"
)

// PATCH LOCAL (Albion Profit Pro): cobertura da task 05 (docs/tasks/client/).
//
// IsValidLocation() e chamada no Process de toda resposta de mercado, e router.go dispara
// uma goroutine por operacao. Sem debounce, um jogador parado no mercado com a localizacao
// nao resolvida recebia uma notificacao nativa do sistema operacional POR PACOTE rejeitado.
// Nao era um aviso, era negacao de servico contra o proprio usuario.

// capturarNotificacoes substitui o push por um contador e restaura no fim.
func capturarNotificacoes(t *testing.T) *[]string {
	t.Helper()
	var recebidas []string
	anterior := pushNotification
	t.Cleanup(func() { pushNotification = anterior })
	pushNotification = func(msg string) { recebidas = append(recebidas, msg) }
	return &recebidas
}

func TestLocalizacaoVaziaAvisaUmaVezSoDentroDaJanela(t *testing.T) {
	recebidas := capturarNotificacoes(t)
	state := &albionState{LocationId: ""}

	for i := 0; i < 50; i++ {
		if state.IsValidLocation() {
			t.Fatal("localizacao vazia deveria ser invalida")
		}
	}

	if len(*recebidas) != 1 {
		t.Errorf("%d notificacoes em 50 chamadas, esperado 1 -- o debounce nao esta segurando", len(*recebidas))
	}
}

func TestAvisoVoltaDepoisDaJanela(t *testing.T) {
	recebidas := capturarNotificacoes(t)
	state := &albionState{LocationId: ""}

	state.IsValidLocation()
	if len(*recebidas) != 1 {
		t.Fatalf("primeira chamada deveria notificar, veio %d", len(*recebidas))
	}

	// simula a janela ter passado, sem esperar 60s de verdade
	state.LocationWarningLastSentAt = time.Now().Add(-locationWarningInterval - time.Second)
	state.IsValidLocation()

	if len(*recebidas) != 2 {
		t.Errorf("%d notificacoes, esperado 2 -- passada a janela o aviso tem que voltar (debounce e janela, nao 'avisa so uma vez e cala pra sempre')", len(*recebidas))
	}
}

// O receiver era por VALOR: qualquer escrita em state morria com a copia, entao memoizar
// "ja avisei" era impossivel. Este teste falha se alguem reverter para receiver por valor.
func TestDebouncePersisteNoState(t *testing.T) {
	capturarNotificacoes(t)
	state := &albionState{LocationId: ""}

	state.IsValidLocation()

	if state.LocationWarningLastSentAt.IsZero() {
		t.Error("LocationWarningLastSentAt continua zerado apos avisar -- receiver por valor?")
	}
}

// A supressao `if !ConfigGlobal.Debug` escondia o aviso justamente de quem estava depurando.
func TestAvisoNaoESuprimidoComDebugLigado(t *testing.T) {
	anterior := ConfigGlobal.Debug
	t.Cleanup(func() { ConfigGlobal.Debug = anterior })
	ConfigGlobal.Debug = true

	recebidas := capturarNotificacoes(t)
	state := &albionState{LocationId: ""}
	state.IsValidLocation()

	if len(*recebidas) != 1 {
		t.Errorf("com -debug ligado houve %d notificacoes, esperado 1 -- a supressao antiga voltou", len(*recebidas))
	}
}

func TestFormatosValidosNaoAvisam(t *testing.T) {
	validos := []string{"1002", "5003", "BLACKBANK-algo", "1000-HellDen", "algo-Auction2"}

	for _, loc := range validos {
		t.Run(loc, func(t *testing.T) {
			recebidas := capturarNotificacoes(t)
			state := &albionState{LocationId: loc}

			if !state.IsValidLocation() {
				t.Errorf("%q deveria ser valido", loc)
			}
			if len(*recebidas) != 0 {
				t.Errorf("%q gerou %d notificacoes, esperado 0", loc, len(*recebidas))
			}
		})
	}
}

// Tabela cruzando normalizeLocationID (o portao de entrada, listener.go) com
// IsValidLocation (o gate dos handlers de mercado). As duas funcoes decidem "o que e uma
// localizacao aceitavel" com regras DIFERENTES, e esta tabela trava o descasamento para ele
// nao mudar sem alguem perceber.
//
// Achado (task 05): quatro formatos de ILHA passam pela normalizacao -- ou seja, viram
// LocationId de verdade -- e depois sao rejeitados pelo `default` de IsValidLocation. Dentro
// de uma ilha o client descarta dado de mercado E avisa, e NENHUMA transicao de zona
// resolve, porque a localizacao esta setada, so nao e "valida".
//
// Impacto pratico baixo (ilha de jogador nao tem mercado, entao respostas de mercado nao
// chegam la), mas a inconsistencia e real. A decisao de produto -- ilha deve ser valida, ou a
// mensagem deve dizer que ali nao se coleta? -- ficou em aberto de proposito: exige confirmar
// em jogo QUAL formato de fato aparece. Ver as notas da task 05.
func TestDescasamentoEntreNormalizacaoEValidacao(t *testing.T) {
	casos := []struct {
		bruto           string
		wantNormalizado string // "" = descartado na entrada, LocationId nunca e setado
		wantValido      bool   // resultado de IsValidLocation sobre o valor normalizado
	}{
		// concordam: numerico e os formatos especiais de mercado
		{"1002", "1002", true},
		{"5003", "5003", true},
		{"BLACKBANK-x", "BLACKBANK-x", true},
		{"1000-HellDen", "1000-HellDen", true},
		{"x-Auction2", "x-Auction2", true},

		// DISCORDAM: passam pela normalizacao e sao rejeitados na validacao
		{"@island@0e3b8e88-8db6-a74f-855f-47489fb68e92", "@ISLAND@0e3b8e88-8db6-a74f-855f-47489fb68e92", false},
		{"island-player-fulano", "island-player-fulano", false},
		{"@player-island-fulano", "@player-island-fulano", false},
		{"@island-fulano", "@island-fulano", false},

		// concordam em rejeitar: nem entram
		{"", "", false},
		{"12", "", false},     // numerico curto demais para normalizeLocationID
		{"3005@1", "", false}, // formato de rest/smuggler den NAO passa pela normalizacao
		{"lixo qualquer", "", false},
	}

	for _, caso := range casos {
		t.Run(caso.bruto, func(t *testing.T) {
			capturarNotificacoes(t)

			normalizado := normalizeLocationID(caso.bruto)
			if normalizado != caso.wantNormalizado {
				t.Errorf("normalizeLocationID(%q) = %q, esperado %q", caso.bruto, normalizado, caso.wantNormalizado)
			}

			state := &albionState{LocationId: normalizado}
			if got := state.IsValidLocation(); got != caso.wantValido {
				t.Errorf("IsValidLocation(%q) = %v, esperado %v", normalizado, got, caso.wantValido)
			}
		})
	}
}
