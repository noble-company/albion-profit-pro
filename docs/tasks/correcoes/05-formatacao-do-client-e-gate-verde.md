# 05 — Formatação do client e `client-ci` verde

> Corrige `E06`.

## Objetivo

Devolver o `client-ci` ao verde e entender por que a falha passou quase uma semana sem ser vista.

## Por que

O próprio script do projeto acusa:

```bash
cd albiondata-client
bash scripts/validate-fmt.sh lib/market.go client/market_snapshot.go
# The following files are not formatted properly:
#  - lib/market.go
#  - client/market_snapshot.go
```

Não é falso positivo de fim de linha: `validate-fmt.sh` normaliza CRLF nos dois lados antes de
comparar, justamente porque o upstream é CRLF. As diferenças são de alinhamento:

- `lib/market.go:86-90` — campos de `MarketSnapshotScope` com uma coluna a mais que o `gofmt`
  produz (`EnchantmentLevel` é o campo mais longo e define o alinhamento).
- `lib/market.go:98-102` — mesma coisa em `MarketUpload`, na coluna das tags.
- `client/market_snapshot.go:56` — `CapturedAt:` com um espaço a menos que os irmãos.

Os dois arquivos entraram no commit `0f56178` (2026-08-31), que é **posterior** ao `8535b29`
(2026-08-23), o commit que criou `.github/workflows/client-ci.yml`. O filtro de `paths` do
workflow casa `albiondata-client/**`. Logo o step "Validate formatting without rewriting CRLF
files" deveria ter rodado e falhado — e o `README.md:179-181` continua dando o gate automatizado
como verde.

Enquanto isso, `go test ./...` e `go vet ./client/` passam; o problema é só de formatação. Mas um
gate que ninguém olha é um gate que não existe.

## O que implementar

1. Aplicar `gofmt` **apenas nesses dois arquivos**, preservando CRLF. Nunca `gofmt -w`
   indiscriminado no fork — é regra do `README.md:151` e do `CLAUDE.md`, porque a reescrita
   integral destrói a comparação com o upstream.
2. Conferir no GitHub Actions o histórico do `client-ci` desde 31/08 e registrar o que aconteceu:
   falhou e passou despercebido, ou não rodou. As duas respostas levam a correções diferentes.
3. Se o workflow vinha falhando sem ninguém notar, decidir o mecanismo de notificação — o
   projeto não tem nenhum hoje.
4. Rodar `bash scripts/validate-fmt.sh` sem argumentos (modo local: diff contra `HEAD` + arquivos
   não rastreados) e confirmar que a árvore inteira está limpa, não só os dois arquivos.
5. **`go vet` só roda no Linux** (`client-ci.yml` usa `ubuntu-latest`), então os arquivos `_win.go`
   — a plataforma em que o client de fato roda — nunca são analisados. Localmente,
   `go vet ./client/` acusa `client/net_interface_filter_win.go:75: possible misuse of
   unsafe.Pointer` (código herdado do upstream, sem `PATCH LOCAL`). Avaliar acrescentar um job
   `windows-latest` só de `vet`/`build`, ou `GOOS=windows go vet` no runner Linux, e registrar a
   decisão sobre o achado do upstream.

## Depende de

Nada.

## Testes automatizados

- `bash scripts/validate-fmt.sh` sai 0 com a árvore limpa.
- `go test ./...` e `go build` continuam verdes.
- Se o job de `vet` para Windows entrar, ele roda e o resultado fica registrado.

## Testes manuais

Confirmar no GitHub Actions que o `client-ci` do commit seguinte fecha verde, e anotar no bloco
de estado o link da execução.
