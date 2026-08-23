# 01 — Token de API na configuração

## Objetivo
Dar ao client um lugar pra guardar o token de API do Albion Profit Pro — via `config.yaml`
(preferido) ou flag `-token` — sem nunca escrever esse valor no log.

## Por que

O client **não tem nenhum mecanismo de autenticação hoje**. Varredura completa do código de
primeira parte (`token|apikey|authorization|bearer|SetBasicAuth|os.Getenv`) não encontrou nada:
os únicos headers que ele seta são `Content-Type` (`client/uploader_http.go:38`) e `User-Agent`
(`client/uploader_http_pow.go:57,94`). Não há env var nenhuma no projeto.

Nosso backend exige `Authorization: Bearer apk_...` em todo ingest
(`backend/src/api_tokens/dependencies.py:12-22`). Sem esta task, qualquer requisição que o client
mandar pro nosso backend leva 401.

Esta task só **guarda** o token. Quem o usa é a task 02.

### Por que `config.yaml` e não só a flag

Flag vira argumento de processo: aparece no `ps`/gerenciador de tarefas, no histórico do shell e
em qualquer screenshot que o usuário poste pedindo ajuda. O repo já lê um `config.yaml` via viper
(`client/config.go:106-128`), então o lugar seguro já existe — só não é usado pra nada além de
WebSocket hoje. A flag continua existindo por conveniência de desenvolvimento e CI.

## O que implementar

### Campo no struct

`client/config.go:47-72` — o struct `config` não tem **nenhuma** tag (viper nunca faz unmarshal
nele, lê campo a campo), então basta:

```go
type config struct {
	AllowedWSHosts  []string
	ApiToken        string   // token do Albion Profit Pro; NUNCA logar
	Debug           bool
	// ...
}
```

### Flag

Em `setupCommonFlags` (`client/config.go:196-245`), no mesmo padrão dos outros:

```go
	flag.StringVar(
		&config.ApiToken,
		"token",
		"",
		"Albion Profit Pro API token. Prefer setting ApiToken in config.yaml -- a flag is visible in the process list.",
	)
```

### Precedência flag > arquivo — tem que ser resolvida à mão

**Este é o ponto que erra fácil.** `SetupFlags` (`client/config.go:80-104`) roda nesta ordem:

```go
func (config *config) SetupFlags() {
	config.setupWebsocketFlags()   // linha 81 -- viper.ReadInConfig() acontece AQUI
	config.setupDebugFlags()       // linha 82
	config.setupCommonFlags()      // linha 83 -- flags so sao REGISTRADAS aqui
	flag.Parse()                   // linha 85 -- e so aqui que sao PARSEADAS
	// ...
}
```

Viper é lido **antes** das flags serem parseadas. Se o fallback for escrito dentro de
`setupWebsocketFlags`, o `flag.Parse()` da linha 85 sobrescreve o valor do arquivo com o default
vazio da flag. O fallback tem que rodar **depois da linha 85** e antes de `config.setupLogs()`
(linha 103):

```go
	flag.Parse()

	// PATCH LOCAL (Albion Profit Pro): flag vence o arquivo, arquivo vence o vazio.
	// Tem que ser DEPOIS do flag.Parse() -- viper foi lido em setupWebsocketFlags(),
	// antes das flags existirem; fazer isso antes seria sobrescrito pelo default vazio.
	if config.ApiToken == "" {
		config.ApiToken = viper.GetString("ApiToken")
	}
```

`viper.GetString` devolve `""` sem erro quando o arquivo não existe (o `ReadInConfig` falhou lá
atrás e o código já trata isso, `config.go:113-115`) — não precisa de guarda extra.

### Achar o `config.yaml` mesmo fora do CWD

`client/config.go:109` só registra `viper.AddConfigPath(".")` — **o diretório de trabalho do
processo, e mais nada**. Quem dá duplo-clique no `.exe` a partir de um atalho tem CWD diferente da
pasta do binário e o arquivo é silenciosamente ignorado. Adicionar o diretório do executável como
segundo caminho de busca:

```go
	viper.SetConfigName("config")
	viper.AddConfigPath(".")
	// PATCH LOCAL (Albion Profit Pro): tambem procurar ao lado do binario -- quem abre
	// por atalho tem CWD diferente da pasta do exe e o config.yaml era ignorado em silencio.
	if exe, err := os.Executable(); err == nil {
		viper.AddConfigPath(filepath.Dir(exe))
	}
```

### `config.yaml.example`

O arquivo hoje tem 3 linhas, todas comentadas. Adicionar o campo novo **e** uma nota de origem:

```yaml
# Token do Albion Profit Pro -- gere em /auth/tokens e cole aqui.
# Preferir este arquivo a flag -token: flag aparece na lista de processos.
# ApiToken: apk_troque-por-um-token-de-verdade

# EnableWebsockets: False
# AllowedWebsocketHosts:
#   - www.example.com
```

`config.yaml` (sem `.example`) já está no `.gitignore` (linha 11) — o token do usuário não corre
risco de ser commitado.

### Não logar o token

`setupLogs` (`client/config.go:247-278`) instala um `io.MultiWriter` que tee-a **todo** log pro
arquivo `albiondata-client.log`. Nenhum log novo pode incluir `config.ApiToken`. Se for útil logar
que o token foi carregado, logar só a origem e o sufixo:

```go
	log.Infof("API token carregado de %v (final ...%v)", origem, sufixo(config.ApiToken))
```

Onde `sufixo` devolve os 4 últimos caracteres — mesma ideia do `token_sufixo` que o backend já usa
pra exibir token na UI sem expor o valor (`backend/src/api_tokens/models.py`).

## Bibliotecas/dependências
Nenhuma nova. `viper` já é dependência (`client/config.go:17`), `os`/`path/filepath` são stdlib.

## Depende de
Nada. É a primeira task da fase.

## Testes manuais
1. `go build ./...` dentro de `albiondata-client/`.
2. `./albiondata-client.exe -token apk_teste -version` → sobe sem erro.
3. Criar `config.yaml` com `ApiToken: apk_doarquivo`, rodar **sem** `-token` → o valor do arquivo é
   usado (confirmar com um log temporário do sufixo, removido depois).
4. Rodar **com** `-token apk_daflag` e o arquivo presente → a flag vence.
5. Rodar de outro diretório apontando pro exe (`cd .. && ./albiondata-client/albiondata-client.exe`)
   → o `config.yaml` ao lado do binário continua sendo encontrado.
6. `grep -i apk_ albiondata-client.log` → **nenhuma ocorrência do valor completo**.

## Testes automatizados
`client/event_festivities_update_test.go:124-138` é o precedente do repo pra teste que depende de
config: salva os campos de `ConfigGlobal`, altera, e restaura num `defer`. Seguir esse padrão.

- Flag preenchida + viper preenchido → vence a flag.
- Flag vazia + viper preenchido → vence o viper.
- Ambos vazios → `ApiToken == ""` (e a task 02 tem que tratar isso sem quebrar).

---

## Notas de implementação (2026-08-23) — task concluída

- **A precedência foi extraída pra `resolveApiToken(fromFlag, fromFile)`** em vez de ficar inline
  no `SetupFlags`. Motivo: a lógica inline só seria testável mexendo no `flag.CommandLine` global,
  que não dá pra reparsear entre casos de teste. A função pura cobre a mesma decisão e os testes
  ficam triviais. `SetupFlags` chama ela logo depois do `flag.Parse()`, como a spec exige.
- **Campo extra não previsto na spec**: `apiTokenOrigem` (não exportado) guarda de onde o token
  veio, só pra mensagem de diagnóstico.
- **O log de token carregado ficou depois de `config.setupLogs()`**, não junto da resolução. Antes
  do `setupLogs` o destino e o nível de log ainda não estão configurados — a linha não iria pro
  `albiondata-client.log`, que é justamente onde ela é útil. Só o sufixo é logado
  (`tokenSufixo()`), nunca o valor.
- **Sem aviso quando não há token.** Chegou a ser considerado, mas nesta altura da fase o default
  do `-i` ainda é o ingest da comunidade (só a task 03 troca), então "sem token" é o estado normal
  e o aviso seria alarme falso. Reavaliar na task 03.
- **⚠️ `gofmt -w` converteu o `config.go` inteiro de CRLF pra LF** — 425 linhas de diff artificial
  contra o upstream, revertido manualmente. Virou convenção da fase, ver
  [README.md](README.md#convenções-específicas-desta-fase).
