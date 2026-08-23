# Tasks — Fase 2 (client Go) ✅ completa

Microetapas da **Fase 2**, derivadas do [plano macro](../../00-plano-macro.md) e do
[mapeamento do client](../../01-mapeamento-albiondata-client.md). Mesmo formato das tasks de
backend: uma unidade de trabalho por arquivo, com spec completa.

**Objetivo da fase:** fazer o `albiondata-client` falar com o *nosso* backend — hoje ele não
conseguia, não existia autenticação nenhuma nele. A captura de craft/refino em tempo real também
entrou no escopo original, mas foi **descopada** em 2026-08-23 (ver abaixo) por decisão de produto.

✅ **Concluída em 2026-08-23 (task 10):** o pipeline `jogo → client → nosso backend → Postgres`
rodou de ponta a ponta com dado real, sem sink nem simulação — o item 2 da seção "Verificação" do
plano macro, aberto desde o início do projeto.

---

## Achados que fundamentam estas tasks

Levantados lendo o código real do fork em 2026-08-23. **Contradizem a documentação anterior** —
as correções de doc estão distribuídas nas tasks que as descobrem.

| # | Achado | Onde | Corrigido na task |
|---|---|---|---|
| `F1` | Dado de mercado sobe pelo canal **público** (`-i`), não pelo privado (`-p`). O plano macro e o `CLAUDE.md` mandavam usar `-p`, o que não traria nenhum dado de mercado. | `operation_auction_get_offers.go:96` e os outros 3 call sites de `sendMsgToPublicUploaders` | 03 |
| `F2` | O fork **já foi modificado** — o patch do `N5` está aplicado. O `CLAUDE.md` diz que está intocado. | `operation_auction_get_offers.go:47` | 03 |
| `F3` | O aviso do `N6` **já existe**, mas sem rate-limit (uma toast por pacote rejeitado) e suprimido justamente sob `-debug`. A task é consertar, não criar. | `albion_state.go:42-68` | 05 |
| `F4` | `createUploaders` tem **panic latente**: valida `len(target) < 4` mas fatia `target[0:9]`. O valor `"noop"`, documentado no help do `-i`, panica. | `dispatcher.go:36` vs `:41` | 03 |
| `F5` | Nosso backend cobre **3 dos 6** tópicos públicos. `mapdata`, `banditevent` e `festivities` virariam 404 a cada evento. | `lib/nats.go` | 04 |
| `F6` | Com `-d`, o JSON **é** serializado no caminho público (o doc 01 §9.4 diz que não). O gate só pega o envio final. | `dispatcher.go:56` vs `:115` | 03 |
| `F7` | **Token de API cru vira chave de Redis** no rate limit (`rl:ingest:Bearer apk_<cru>:...`). Mesma classe do achado `A1` que a task 32 corrigiu no Postgres. | `src/rate_limit.py:27-30` | ⬜ **Fase 2.5 task 08** |

---

## Ordem de implementação

```
ETAPA 1 — client fala com o nosso backend (destrava tudo)
01 Token de API na config
  └─ 02 Uploader autenticado + robustez HTTP
       └─ 03 Apontar o ingest pro backend + fix do createUploaders
04 Backend: validacao de token + topicos nao usados  (paralelo a 01-03)

ETAPA 2 — UX do achado N6 (paralelo a etapa 1)
05 Consertar o aviso de localizacao

ETAPA 3 — craft/refino em tempo real
06 Sessao de captura controlada (investigacao, roda no jogo)  ✅ virou documentacao
  ├─ 07 Handlers de craft/refino no client        ❌ DESCOPADA
  │    └─ 08 DTO, topico e dispatch               ❌ DESCOPADA
  └─ 09 Backend: ingest de eventos de craft       ❌ DESCOPADA

FECHAMENTO
10 Validacao ponta a ponta em jogo (depende de tudo)
```

### Por que 07-09 foram descopadas (2026-08-23)

A calculadora é ferramenta de **planejamento**: o jogador informa o que quer produzir, em qual
estação e com qual taxa de retorno, e vê custo e lucro. Decisão de produto do usuário.

Fechando a conta dos insumos, **nenhum deles vem de evento de craft**:

| Insumo | De onde vem |
|---|---|
| Receita (ingredientes, foco, quantidade) | `ITEM DUMP.json` — 5553 já importadas |
| Preço dos ingredientes e do produto | pipeline de mercado (tasks 01-04) |
| Taxa da estação | **jogador informa** |
| Taxa de retorno | **jogador informa** |
| Quanto quer produzir | **jogador informa** |
| Taxa de mercado (6,5% / 4%) | constante conhecida |

Capturar `evCraftItemFinished`/`evCraftBuildingInfo` não alimenta nenhuma dessas células. Construir
as três tasks significaria manter tabelas, schemas e testes que ninguém consultaria — além de mais
superfície de patch num fork que precisa continuar rebaseável.

Isso também reconcilia com o desenho original da Fase 3 no
[plano macro](../../00-plano-macro.md), que descrevia o cálculo de lucro exatamente assim, sem
mencionar evento de craft. A captura de craft entrou na Fase 2 durante o planejamento e não
sobreviveu ao contato com o produto.

**As specs de 07-09 ficam no repositório**, não apagadas: se um dia fizer sentido (histórico,
validar previsão contra realidade, sugerir taxa de estação em vez de pedir), o protocolo está todo
mapeado em [doc 03 §8b](../../03-contrato-ingest-real.md) e é só implementar.

## Lista

| # | Task | Onde | Entrega |
|---|---|---|---|
| [01](01-token-de-api-na-config.md) | Token de API na configuração | client | Campo `ApiToken`, flag `-token`, `config.yaml` |
| [02](02-uploader-autenticado.md) | Uploader autenticado e robusto | client | `http+token://`, header `Authorization`, timeout |
| [03](03-apontar-ingest-pro-backend.md) | Apontar o ingest pro nosso backend | client | Default do `-i` + fix do `createUploaders` (`F4`) |
| [04](04-backend-validacao-e-topicos.md) | Backend: validar token e absorver tópicos | backend | `GET /client/me` + rotas accept-and-drop (`F5`) |
| [05](05-aviso-de-localizacao.md) | Consertar o aviso de localização | client | Debounce do `N6` (`F3`) |
| [06](06-captura-craft-refino.md) | Sessão de captura controlada | investigação | Semântica do craft documentada em [doc 03 §8b](../../03-contrato-ingest-real.md) |
| ~~[07](07-handlers-craft-refino.md)~~ | ~~Handlers de craft/refino~~ | — | ❌ **descopada** — ver acima |
| ~~[08](08-dto-topico-craft.md)~~ | ~~DTO, tópico e dispatch~~ | — | ❌ **descopada** — ver acima |
| ~~[09](09-backend-ingest-craft.md)~~ | ~~Backend: ingest de craft~~ | — | ❌ **descopada** — ver acima |
| [10](10-validacao-ponta-a-ponta.md) | Validação ponta a ponta em jogo | manual | Fecha a Fase 2 |

## Status — Fase 2

Marcado por quem implementa (ou pela skill `/implementar-task`) assim que uma task é concluída e
seus testes passam. Fonte de verdade pra saber o que já está pronto antes de começar a próxima.

- [x] 01 — Token de API na configuração
- [x] 02 — Uploader autenticado e robusto
- [x] 03 — Apontar o ingest pro nosso backend
- [x] 04 — Backend: validação de token e tópicos não usados
- [x] 05 — Consertar o aviso de localização
- [x] 06 — Sessão de captura controlada de craft/refino
- [~] 07 — ~~Handlers de craft/refino no client~~ — **descopada** (2026-08-23)
- [~] 08 — ~~DTO, tópico e dispatch de craft~~ — **descopada** (2026-08-23)
- [~] 09 — ~~Backend: ingest de eventos de craft~~ — **descopada** (2026-08-23)
- [x] 10 — Validação ponta a ponta em jogo

## Convenções específicas desta fase

- **O fork tracked um projeto real.** Toda modificação nossa leva o comentário `PATCH LOCAL
  (Albion Profit Pro)` explicando o porquê, como já foi feito no patch do `N5`
  (`client/operation_auction_get_offers.go:47`). Isso mantém o fork rebaseável contra o upstream e
  deixa óbvio pra quem lê o que é nosso e o que é deles.
- **Nada de refatoração oportunista.** Corrigir só o que a task pede — bugs vizinhos viram achado
  documentado (`F1`…`Fn` acima), não commit extra.
- **`go build ./...` e `go test ./...` antes de dar qualquer task por concluída.** O repo tem
  `vendor/` completo, então builda offline. O Go instalado nesta máquina é o **1.27.0**, e
  **não está no PATH** — usar `C:\Program Files\Go\bin`.
- **⚠️ Nunca rodar `gofmt -w` neste repo.** Todos os arquivos `.go` do upstream usam **CRLF**, e o
  `gofmt` reescreve tudo em LF — o que transforma um patch de 5 linhas num diff de arquivo inteiro
  e destrói a rebaseabilidade contra o upstream. Pelo mesmo motivo, **`gofmt -l` é inútil aqui**:
  ele lista *todos* os arquivos por causa do fim de linha, não por formatação. Pra checar
  formatação de verdade, comparar o conteúdo ignorando fim de linha:
  ```powershell
  gofmt arquivo.go > tmp.txt; Compare-Object (Get-Content arquivo.go) (Get-Content tmp.txt)
  ```
  (descoberto na task 01, depois de um `gofmt -w` ter convertido o `config.go` inteiro pra LF)
- **`go vet ./client/` já acusa um problema pré-existente** do upstream
  (`net_interface_filter_win.go:75`, `possible misuse of unsafe.Pointer`). Não é regressão — não
  tentar consertar dentro de uma task que não seja sobre isso.
- **O token nunca pode aparecer em log.** `setupLogs` (`client/config.go:247-278`) tee-a todo log
  pro `albiondata-client.log`, que fica no disco do usuário.
