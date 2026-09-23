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

## Estado da implementação

**Concluída** (2026-09-22) — **Caminho B, decisão do responsável do produto** (perguntado
explicitamente antes de qualquer implementação, dado o tamanho e o risco bem diferentes dos dois
caminhos). Decisão completa registrada em
[14-revisao-fase-3-5.md, "Decisões desta revisão" §5](../../14-revisao-fase-3-5.md#decisões-desta-revisão).

- **A decisão** — não implementar a reconciliação transacional agora. Mexer de novo no client Go
  recém-estabilizado, logo depois da 3.6/14, por um ganho que a mitigação já em produção
  (expiração + janela de frescor + projeção da última observação) cobre parcialmente, não se
  paga no momento. Reavaliável se o volume de reclamação sobre preço errado justificar.
- **`frontend/src/scanner/ExactAnalysis.tsx`** — ressalva permanente ("Este preço é da última
  coleta, não do livro agora. Uma ordem pode já ter sido comprada ou cancelada antes de sumir da
  tela.") com ícone `Clock`, sempre visível, **não condicionada a nenhum `warning` do backend**
  — é limite estrutural do sistema, não uma condição pontual de uma resposta. Este componente é
  o extrato "Analisar com o livro real", compartilhado por Market Flip, Refino, Craft e
  Calculadora via `DetalheDaLinha.tsx` — é "onde o jogador decide" que a spec pede, num lugar só.
- **`frontend/src/scanner/ExactAnalysis.test.tsx`** — teste novo confirmando que a ressalva
  aparece **antes** de qualquer chamada de rede (é permanente, não depende do resultado da
  análise).
- `20.4` permanece formalmente aberta como pendência técnica conhecida — a decisão fecha o
  "sem decisão de quando" do achado `P03`, não o achado em si.

### Desvios da spec

- **Não reaproveitei o warning `ordem_nao_garantida` já existente.** Ele significa outra coisa:
  dispara quando o cenário **cria** uma ordem nova (`creates_order`, `craft/service.py:99` e
  `compare_service.py:233`) — "sua ordem pode não ser preenchida", não "a ordem que você está
  vendo pode já ter sumido". Reusar o mesmo texto pros dois casos misturaria dois avisos
  diferentes sob um rótulo que já tem sentido fixado e testado. A ressalva nova é texto estático
  sem chave de warning, exatamente porque é incondicional (§4 de `13-linguagem-visual.md` é pra
  avisos **do backend**, condicionais por resposta — este não é).

### Testes automatizados

`npm run lint` (0 erros, mesmos 8 warnings pré-existentes), `npm run typecheck` (limpo),
`npm run test` (595/595, era 594 antes). `python scripts/verify_repository.py` verde.

### Pendente pra você testar

- Nenhum — a decisão foi tomada por você mesmo (Caminho B), e a mudança de UI é puramente
  textual/visual, coberta pelo teste automatizado. Se quiser conferir visualmente: abrir
  qualquer linha do scanner com "Analisar com o livro real" disponível e confirmar que a
  ressalva aparece assim que o painel abre, antes de clicar no botão.
