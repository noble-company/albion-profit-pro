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
