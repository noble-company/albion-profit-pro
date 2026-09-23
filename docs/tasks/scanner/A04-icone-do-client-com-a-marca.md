# A04 — Ícone do client com a marca

> Ajuste depois do fechamento da Fase 4 ([README](README.md#ajustes-depois-do-fechamento)). Não
> reabre a contagem da fase. Parte dos originais e do script da
> [A03](A03-marca-no-site.md).

## Objetivo

O client distribuído pelo produto deixa de se apresentar com o ícone do Albion Data Project: o
ícone da bandeja do Windows, o do `.exe` e o do instalador passam a ser o escudo "AP" do Albion
Profit Pro.

## Por que

Conferido em 2026-09-13. O client é o fork do `albiondata-client`, e o ícone ainda é o do upstream
em todos os lugares onde o jogador o vê:

| Onde aparece | De onde vem | Evidência |
|---|---|---|
| **Bandeja do Windows** | `icon.Data`, um `.ico` com 16, 32, 48, 64, 128 e 256 px embutido como array de bytes | `albiondata-client/systray/systray_win.go:65`; `icon/iconwin.go` (gerado por `2goarray` via `icon/make_icon.bat`) |
| **Ícone do `.exe`** (Explorer, barra de tarefas) | `go-winres` gera o recurso a partir do PNG | `albiondata-client/winres/winres.json:5-6`; `scripts/build-windows.sh:24-32` |
| **Instalador e desinstalador** | NSIS lê o `.ico` | `albiondata-client/pkg/nsis/albiondata-client.nsi:44-45` |
| **Bandeja do macOS** | o PNG, por `go:embed` | `icon/icondarwin.go:11`; `systray/systray_darwin.go:39` |

Os arquivos de origem são `icon/albiondata-client.ico`, `icon/albiondata-client.png` e
`icon/albiondata-client.psd` (a arte do upstream).

**Tamanhos da bandeja:** o `.ico` atual não tem 20 nem 24 px. Com a escala do Windows em 125% e
150%, a bandeja pede esses tamanhos e o sistema reduz o de 32 — o escudo, que já é detalhado,
borra. O ícone novo leva os dois.

## O que implementar

1. **Gerar a partir do original.** `scripts/gerar_marca.py` (criado na A03) ganha as saídas do
   client, a partir de `assets/marca/escudo-ap.png`:

   | Saída | Conteúdo |
   |---|---|
   | `albiondata-client/icon/albiondata-client.ico` | 16, 20, 24, 32, 48, 64, 128 e 256 px |
   | `albiondata-client/icon/albiondata-client.png` | 256 px, transparente — `go-winres` e macOS |

   **Mantém os nomes dos arquivos.** Assim `winres.json`, o `.nsi` e o `go:embed` não mudam, e a
   diferença com o upstream fica só nos binários.
2. **Regenerar `icon/iconwin.go`** com o `2goarray`, como o upstream faz. O `make_icon.bat` instala
   a ferramenta com `go get`, que não instala binário desde o Go 1.18: instalar com
   `go install github.com/cratonica/2goarray@<versão fixada>` e rodar o mesmo pipeline
   (`type albiondata-client.ico | 2goarray Data icon`), com o cabeçalho `//+build windows`.
   Não é para escrever o array por outro caminho — é arquivo gerado, e o gerador é o do upstream.
3. **`icon/albiondata-client.psd` sai.** É a arte do ícone antigo; o original agora é
   `assets/marca/escudo-ap.png`.
4. **Registro do patch.** Binário não carrega comentário, então a troca vai para a lista de patches
   locais do `albiondata-client/README.md` (`:155`) com a marca `PATCH LOCAL (Albion Profit Pro)`:
   quais arquivos, de onde vêm e como regenerar. É o que impede um merge do upstream de trazer o
   ícone antigo de volta em silêncio.
5. **Formatação.** Nada de `gofmt -w` no fork (o upstream é CRLF). Rodar `scripts/validate-fmt.sh`
   e conferir que o `iconwin.go` gerado sai com a mesma quebra de linha do atual.

## Depende de

- **A03** — os originais em `assets/marca/` e o script.
- **3.6/05** (formatação do client e `client-ci` verde), pelo mesmo motivo da 3.6/14: mexer no
  client com o CI vermelho esconde regressão.
- Não depende da 3.6/14, mas mexe na mesma área (bandeja). Se as duas andarem juntas, um PR só.

## Fora de escopo

- **Nome e textos do client** (título do console, tooltip da bandeja, nome do instalador): continuam
  os do upstream. Renomear o client é outra decisão.
- **Ícone de estado** (bandeja mudando de cor conectado/desconectado).
- **Linux**: o fork não embute ícone para Linux hoje (`make_icon.sh` gera `iconunix.go`, que não
  existe no repositório); continua assim.

## Testes automatizados

- **Guard novo nasce vermelho** — `albiondata-client/icon/icon_test.go`, rodado antes da troca e
  registrado abaixo: `icon.Data` é um ICO válido (assinatura `00 00 01 00`) com **16, 20, 24 e
  32 px**. O ícone atual falha por não ter 20 nem 24.
- `go build` para Windows e macOS (`GOOS=windows`, `GOOS=darwin`), `go test ./...`, `go vet` e
  `scripts/validate-fmt.sh` verdes.
- Script: rodar duas vezes e conferir com `git status` que a segunda não muda nada.

## Testes manuais

Só no Windows, com o client compilado por `scripts/build-windows.sh`:

1. Bandeja com o escudo em escala 100%, 125% e 150% do Windows: nítido nos três.
2. O `.exe` no Explorer e na barra de tarefas com o escudo.
3. Instalador e desinstalador (NSIS) com o escudo.
4. Menu da bandeja funcionando igual (nada além do ícone mudou).

## Estado da implementação

**Não iniciada.**
