package client

import "testing"

// PATCH LOCAL (Albion Profit Pro): cobertura da task 3.6/14 -- "Abrir Calculadora" no systray.
//
// resolveCalculatorURL espelha resolvePublicIngestBaseURLs (mesma precedencia, mesmo motivo:
// nao herdar o default de desenvolvimento em silencio quando o release nao configurou nada). O
// abrir-navegador em si nao e testavel em CI; o que importa isolar e testar aqui e a decisao de
// qual URL usar e se o item deve ficar habilitado.

func TestResolveCalculatorURLDefaultDeDesenvolvimento(t *testing.T) {
	resolved, origem := resolveCalculatorURL("", "", "development", "")
	if resolved != developmentCalculatorURL {
		t.Errorf("resolved = %q, esperado default de desenvolvimento %q", resolved, developmentCalculatorURL)
	}
	if origem != "default de desenvolvimento" {
		t.Errorf("origem = %q, esperado %q", origem, "default de desenvolvimento")
	}
}

func TestResolveCalculatorURLOverridePorConfigYaml(t *testing.T) {
	resolved, origem := resolveCalculatorURL("", "https://app.profit.test", "development", "")
	if resolved != "https://app.profit.test" || origem != "config.yaml" {
		t.Errorf("resolucao = %q (%s), esperado override do config.yaml", resolved, origem)
	}
}

func TestResolveCalculatorURLFlagVenceConfigYaml(t *testing.T) {
	resolved, origem := resolveCalculatorURL("https://flag.profit.test", "https://arquivo.profit.test", "release", "")
	if resolved != "https://flag.profit.test" || origem != "flag -calculator-url" {
		t.Errorf("resolucao = %q (%s), esperado destino da flag", resolved, origem)
	}
}

// Guarda de regressao: release sem URL nenhuma configurada nao pode herdar o localhost de
// desenvolvimento -- o item do systray tem que ficar desabilitado, nao abrir um destino errado.
func TestResolveCalculatorURLReleaseSemURLNaoHerdaLocalhost(t *testing.T) {
	resolved, origem := resolveCalculatorURL("", "", "release", "")
	if resolved != "" {
		t.Fatalf("release sem URL resolveu %q (%s), esperado vazio (item desabilitado)", resolved, origem)
	}
}

func TestResolveCalculatorURLReleaseUsaDefaultInjetadoPorLdflags(t *testing.T) {
	resolved, origem := resolveCalculatorURL("", "", "release", "https://calculadora.profit.test")
	if resolved != "https://calculadora.profit.test" || origem != "build de release" {
		t.Errorf("resolucao = %q (%s), esperado default de release injetado por ldflags", resolved, origem)
	}
}

// Guarda de regressao: o campo tem que existir no struct e ser legivel via CalculatorURL() de
// qualquer pacote -- e assim que o systray decide se habilita o item do menu.
func TestCalculatorURLAcessivelPeloConfigGlobal(t *testing.T) {
	anterior := ConfigGlobal.CalculatorUrl
	defer func() { ConfigGlobal.CalculatorUrl = anterior }()

	ConfigGlobal.CalculatorUrl = "https://calculadora.teste"
	if got := CalculatorURL(); got != "https://calculadora.teste" {
		t.Errorf("CalculatorURL() = %q, esperado %q", got, "https://calculadora.teste")
	}
}
