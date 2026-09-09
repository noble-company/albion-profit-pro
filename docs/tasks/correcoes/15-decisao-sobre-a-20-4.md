# 15 — Decisão sobre a reconciliação 20.4

> Corrige `P03`. Fecha a última pendência de
> [3.5/28](../refatoracao/28-retomada-dos-snapshots.md).

## Objetivo

Tirar do limbo a única sub-task da extensão 20 que continua aberta: inativar ordem que sumiu do
mercado. Ou se implementa, ou o limite fica escrito e comunicado na tela.

## Por que

`tasks/refatoracao/28-retomada-dos-snapshots.md:67` registra:

> **20.4 Reconciliação transacional — Continua aberta, bloqueada no client Go.** Inativar ordem
> por ausência precisa do client emitir snapshot vazio + `Scope` explícito, adiado de propósito
> na 20.2. No interino: expiração + janela de frescor + projeção.

O código confirma o bloqueio. `albiondata-client/client/market_snapshot.go:16-33` monta o `Scope`
**a partir das ordens observadas**:

```go
scopes := make(map[lib.MarketSnapshotScope]struct{})
for _, order := range orders {
    scope := lib.MarketSnapshotScope{ ... }
    ...
}
```

Se o book de uma combinação ficou vazio, não há ordem para derivar escopo — logo o backend não
recebe nenhuma afirmação de "esta combinação está vazia agora" e não tem como inativar por
ausência. `lib/market.go:97-103` já carrega os campos (`SnapshotId`, `CapturedAt`, `CompletedAt`,
`Scope`), todos `omitempty`; falta o client afirmar o escopo consultado independentemente do
resultado.

O paliativo atual é `expires > now()` (task 3.5/02, `B03`) mais janela de frescor. Isso cobre
ordem que venceu, **não** ordem cancelada ou consumida antes de vencer — que é o caso comum: o
jogador compra a ordem barata que a tela recomendou, e ela continua aparecendo.

Este é o achado que mais afeta a confiança no número que a tela mostra. É o `B03` pela outra
ponta.

## O que implementar

Primeiro **decidir**, e registrar a decisão em
[14-revisao-fase-3-5.md](../../14-revisao-fase-3-5.md), como as decisões da 3.5 foram registradas
na revisão da Fase 3.

**Caminho A — implementar.** O client passa a emitir o escopo consultado mesmo quando a resposta
vem vazia:

1. `client/operation_auction_get_offers.go:92` e `operation_auction_get_requests.go:42` derivam o
   escopo da **consulta** (item, cidade, qualidade, encantamento, tipo de leilão), não das ordens
   recebidas — a informação está na operação, não na resposta.
2. `marketUploadWithSnapshot` aceita escopo explícito e emite `Orders: []` com `Scope` preenchido.
3. Backend: consumir `Scope` no ingest e inativar as ordens da combinação que não vieram no
   snapshot, com `SnapshotId`/`CapturedAt` para ordenar e evitar que um snapshot antigo desfaça
   um recente.
4. Executar as sub-tasks `20.4` e `20.11` das specs revisadas
   ([20-snapshot-precos-atuais.md](../frontend/20-snapshot-precos-atuais.md)).

**Caminho B — assumir o limite.** Registrar por escrito que o produto opera com "ordem some só ao
expirar", e fazer a UI comunicar isso onde o usuário decide — o vocabulário de confiança já
existe (`src/design/confidence.ts`, `docs/13-linguagem-visual.md`).

O que **não** pode continuar é a terceira via de hoje: documentado como aberto, sem decisão de
quando, e silencioso na tela.

## Depende de

Tasks 05 e 14 (as duas tocam o client; agrupar o trabalho no fork).

## Testes automatizados

No caminho A:

- Snapshot vazio com escopo explícito inativa as ordens daquela combinação e não toca em outras.
- Snapshot antigo chegando depois de um recente não reativa ordem inativada.
- Ordem inativada some de Market Flip, Refino, Craft e Calculadora.
- `go test ./...` cobre a derivação de escopo a partir da consulta.

No caminho B: teste de que a UI exibe a ressalva de frescor onde o usuário decide.

## Testes manuais

`20.11`, no gate da task 3/19: mapear um mercado, comprar ou cancelar uma ordem, mapear de novo —
a ordem removida não pode aparecer em nenhuma das quatro telas, e o preço novo tem que aparecer
em todas, inclusive em cidade diferente e no Black Market.
