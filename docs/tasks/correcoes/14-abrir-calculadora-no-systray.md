# 14 — "Abrir Calculadora" no systray

> Corrige `P02`. Pré-requisito da Fase 4.

## Objetivo

Construir no client a entrada para a interface web que a Fase 2 previa e nunca entregou — que é
justamente o que a Fase 4 se propõe a substituir por um webview.

## Por que

`docs/00-plano-macro.md:249` define a Fase 4 assim:

> Trocar o "abrir navegador" da Fase 2 por um webview nativo embutido (…), carregando a mesma URL
> do frontend dentro de uma janela própria do client.

E `00-plano-macro.md:177` descreve o que a Fase 2 deveria ter deixado pronto: um item de menu
"Abrir Calculadora" que, na primeira versão, só abre o navegador padrão na URL do frontend.

Esse item não existe. `albiondata-client/systray/systray_win.go:70-78` tem, na ordem: build info
(desabilitado), estado da conexão (desabilitado), "Reload Configuration", separador, "Show/Hide
Console" e "Quit". Grep por `exec.Command`, `openBrowser` ou "Calculadora" no pacote: nada.

Ou seja, a Fase 4 começaria substituindo algo que não está lá. Construir a versão simples
primeiro tem três vantagens: entrega valor imediato (o usuário do client chega ao produto sem
decorar URL), valida a questão de configuração (qual URL? de onde vem?) antes de embutir um
webview, e dá à Fase 4 um ponto de partida real.

**Correção de caminho, de quebra:** `00-plano-macro.md:177` e `:255` apontam o systray como
`albiondata-client/client/systray/systray_win.go`. O caminho real é `albiondata-client/systray/`,
na raiz do fork. Corrigir junto (também listado na task 17).

## O que implementar

1. Item de menu "Abrir Calculadora" nas três variantes (`systray_win.go`, `systray_darwin.go`,
   `systray_others.go`), abrindo o navegador padrão do sistema — `rundll32`/`start` no Windows,
   `open` no macOS, `xdg-open` nos demais.
2. Decidir de onde vem a URL: campo novo no `config.yaml` com default apontando para o destino de
   produção, coerente com o que a task 13 publicar. O client já tem `PublicIngestBaseUrls` e
   `ApiToken` em `client/config.go`, então o padrão de configuração existe.
3. Coerência com o comportamento fail-closed do client: build local aponta para localhost;
   release sem URL explícita não deve abrir destino arbitrário.
4. Marcar tudo com `PATCH LOCAL (Albion Profit Pro)`, como as demais modificações do fork.
5. Nunca rodar `gofmt -w` no fork inteiro — só nos arquivos tocados, preservando CRLF.
6. Corrigir os caminhos de systray em `docs/00-plano-macro.md:177,255`.

## Depende de

Task 13 (a URL de produção precisa existir antes de virar default) e task 05 (o `client-ci`
precisa estar verde antes de mexer no client).

## Testes automatizados

- Teste unitário do resolvedor de URL: default por ambiente, override por `config.yaml`, e
  recusa de destino vazio em release.
- `go test ./...`, `go vet` e `scripts/validate-fmt.sh` verdes.
- A abertura do navegador em si não é testável em CI — isolar a decisão (qual URL, abrir ou não)
  da chamada de sistema, e testar a decisão.

## Testes manuais

No Windows, com o client rodando: clicar em "Abrir Calculadora" no systray e confirmar que o
navegador padrão abre na URL certa. É parte do gate da task 3/19.

## Estado da implementação

**Concluída** (2026-09-22). `go build`, `go vet ./client/` (só o achado pré-existente do
upstream, `W14`), `go vet ./systray/...` (limpo) e `go test ./...` verdes no Windows;
`bash scripts/validate-fmt.sh` (árvore inteira) verde.

- **`client/config.go`** — `CalculatorUrl` no struct `config`, seguindo exatamente o padrão de
  `ApiToken`/`PublicIngestBaseUrls`: `resolveCalculatorURL(fromFlag, fromFile, profile,
  releaseDefault)` (flag `-calculator-url` > `config.yaml` (`CalculatorUrl:`) > default de
  release injetado por ldflags > vazio se release não configurar nada — nunca herda
  `developmentCalculatorURL` em silêncio). Getter `client.CalculatorURL()` exportado, protegido
  pelo mesmo `connectionConfigMu` das outras configs de conexão; recalculado também em
  `reloadConnectionConfigFromFile()` (o "Reload Configuration" do systray já existente).
- **`client/config_calculator_url_test.go`** (novo) — 6 testes isolando o resolvedor da chamada
  de sistema, incluindo o guard de regressão "release sem URL não herda localhost" (espelha
  `TestReleaseSemDestinoNaoHerdaLocalhost` do ingest).
- **`systray/systray_win.go`** e **`systray/systray_darwin.go`** — item "Abrir Calculadora" como
  primeira entrada do menu (antes até do build info — é o ponto de entrada do produto),
  desabilitado (não escondido) quando `client.CalculatorURL() == ""`; `openBrowser(url)` usa
  `rundll32 url.dll,FileProtocolHandler` no Windows e `open` no macOS (mesmo padrão que
  `openLogFile` já usava no Darwin). `url` vem só de config resolvida, nunca de entrada do
  usuário.
- **`scripts/build-{windows,linux,darwin}.sh`** — novo `CALCULATOR_URL` (default vazio) injetado
  via `-X .../client.releaseCalculatorURL=${CALCULATOR_URL}`, mesmo padrão do
  `PUBLIC_INGEST_BASE_URL`.
- **`docs/00-plano-macro.md:112`** — corrigido `client/systray/` → `albiondata-client/systray/`
  (os outros dois pontos que a spec citava, `:177` e `:255`, já apontavam pro caminho certo
  quando fui checar — o documento tinha sido parcialmente reconciliado antes desta task).

### Desvios da spec

- **`systray/systray_others.go` (Linux) não ganhou o item de menu.** Esse arquivo já é hoje um
  stub completo — `Run()` não faz nada, não existe tray nem menu nenhum no Linux (diferente de
  Windows/macOS, que têm `onReady()` real). Não há menu pra adicionar um item. Implementar um
  tray Linux de verdade (via `getlantern/systray`, que precisa de GTK/AppIndicator) seria uma
  funcionalidade nova, não uma correção, e eu não tenho como testar num ambiente Linux com
  desktop a partir daqui. Deixei o arquivo intocado; é uma lacuna pré-existente, não algo que
  esta task criou.
- **Verificação cruzada de plataforma foi parcial.** `go build`/`go vet`/`go test` rodaram de
  verdade só para Windows (ambiente nativo). Para macOS o cross-compile precisa do toolchain
  `osxcross` que só existe na imagem do `build-darwin.sh`; para Linux precisa dos headers do
  libpcap que só o runner do `client-ci` tem. `gofmt` (que faz parsing de AST completo) validou
  a sintaxe de `systray_darwin.go` sem erro, e o código novo segue byte a byte o mesmo padrão de
  chamada (`client.NomeDaFuncao()`) já usado nesse arquivo — mas a tipagem cruzada plataforma-a-
  plataforma não foi compilada de verdade por mim. Fica pro `client-ci` (Linux) e pra release
  (macOS) confirmar.
- **`-calculator-url` como flag nova** não foi pedido explicitamente pela spec (que só fala em
  "campo novo no config.yaml"), mas segue o mesmo padrão de precedência já testado
  (flag/config.yaml/default) que `-token`/`-i` usam — reaproveitar em vez de criar um caminho de
  configuração diferente só pra esse campo.

### Pendente pra você testar

- **No Windows, com o client rodando:** clicar em "Abrir Calculadora" no systray e confirmar que
  o navegador padrão abre na URL configurada (`CalculatorUrl` no `config.yaml`, ou o default de
  desenvolvimento `http://localhost:5173` se nada estiver configurado). Também confirmar que,
  numa build de release sem `CALCULATOR_URL` definida no ambiente do build, o item aparece
  **desabilitado** (cinza, não clicável) em vez de tentar abrir algo.
- **`client-ci` no GitHub Actions** — confirmar verde no commit desta task (cobre Linux
  build/vet/test/race que não rodei aqui).
- **macOS** — sem ambiente disponível; confirmar manualmente ou via `build-darwin.sh` que o
  item aparece e abre o navegador com `open`.
