# Tasks — Fase 3.6: correções da revisão da Fase 3.5

> **Substituída pela [Fase 4](../scanner/README.md) em 2026-09-07.** O uso real mostrou que Refino
> e Craft precisavam de outra arquitetura, e as telas que esta fase corrigiria foram reescritas. O
> destino de cada task está na [herança da 3.6](../scanner/README.md#herança-da-fase-36).
> **Seguem valendo:** 05, 06, 08, 09, 10, 13, 14, 15 e 17 — com **13 e 14 primeiro**, porque o
> gate 19 depende das duas. O checklist abaixo continua sendo o status delas; o resto do texto é o
> registro da fase como foi planejada.

Derivada da [revisão da Fase 3.5](../../14-revisao-fase-3-5.md). É uma fase transversal curta:
há trabalho em frontend, backend, client Go, CI e documentação.

**Objetivo:** fechar o que a Fase 3.5 deixou passar — um cálculo que diverge do motor Python,
duas telas que caem em branco, gates que passam sem verificar o que prometem — e destravar a
task 19 da Fase 3, que é o gate final do produto. A fase termina quando nenhum caminho de
entrada do usuário derruba a tela ou produz número diferente do backend, quando os gates
verdes significam o que dizem, e quando existe caminho de deploy do frontend.

> ⚠️ As **tasks 01-04 são de usuário final** e vêm antes de qualquer outra. São um número
> errado (`E01`) e dois caminhos de tela branca (`E02`/`E03`/`E04`) numa tela que já está no ar.

## Decisões que guiam a fase

Detalhadas em [14-revisao-fase-3-5.md](../../14-revisao-fase-3-5.md#decisões-desta-revisão).

1. **Defeito de usuário antes de contrato, documento ou gate.** `E01`–`E05` são o que uma
   pessoa encontra usando o produto hoje.
2. **`P04` e `P06` não viram correção de código.** O ranking neutro é decisão de arquitetura já
   tomada; o que falta é confirmar em jogo que a UI comunica a diferença. Os três motores de
   preço são deliberadamente diferentes; o que falta é o documento parar de prometer um só.
3. **A task 19 é implementação, não só ensaio.** O serving e o deploy do frontend saem dela e
   viram task 13 desta fase, como a 3.5/27 substituiu a task 18 da Fase 3.
4. **Nenhum guard novo que não falhe antes.** Toda task que mexe em teste ou lint precisa
   demonstrar o guard em vermelho no defeito real antes de ficar verde.

## Ordem e dependências

```text
BLOCO 0 — o que o usuário sente (bloqueante)
01 Aritmética decimal na entrada    ◄── divergência com o Python
02 Entrada de filtro à prova de queda
03 ErrorBoundary de verdade         ◄── sem ele, 02 ainda cai em branco
04 Erros de formulário na Calculadora

BLOCO 1 — gates que mentem
05 Formatação do client e client-ci verde   (paralelo)
06 Contrato inglês completo e guard honesto
07 Guards de frontend que guardam   ── depende de 01-04
08 Baseline Git verificado de verdade       (paralelo)

BLOCO 2 — correção e resiliência
09 Índice trigram no modelo                 (paralelo)
10 Tipo único de dinheiro no contrato ── depende de 06
11 Retry real e erro que não some

BLOCO 3 — cobertura do núcleo
12 E2E de Refino, Craft, Calculadora e Preços ── depende de 01-04, 11

BLOCO 4 — destravar o gate final
13 Serving e deploy do frontend       ◄── tira a implementação da task 3/19
14 "Abrir Calculadora" no systray     ◄── premissa da Fase 4
15 Decisão sobre a reconciliação 20.4

BLOCO 5 — fechamento
16 Documentos reconciliados com a 3.5
17 Higiene de repositório e imagem
```

Implementar **uma por vez** com a skill `/implementar-task`; cada spec deve ser validada contra
o estado real e receber confirmação explícita antes de alterar código.

## Lista

| # | Task | Corrige | Entrega principal |
|---|---|---|---|
| [01](01-aritmetica-decimal-na-entrada.md) | Aritmética decimal na entrada | `E01` | Retorno digitado deixa de divergir do motor Python |
| [02](02-entrada-de-filtro-a-prova-de-queda.md) | Entrada de filtro à prova de queda | `E02` `E03` | Vírgula e valor fora de faixa não derrubam a tela |
| [03](03-errorboundary-de-verdade.md) | ErrorBoundary de verdade | `E04` | Erro de render vira estado de erro, não tela branca |
| [04](04-erros-de-formulario-na-calculadora.md) | Erros de formulário na Calculadora | `E05` | O botão para de falhar em silêncio |
| [05](05-formatacao-do-client-e-gate-verde.md) | Formatação do client e gate verde | `E06` | `client-ci` volta a passar de verdade |
| [06](06-contrato-ingles-completo.md) | Contrato inglês completo | `E07` | Query params, enums e erros em inglês; guard que enxerga |
| [07](07-guards-de-frontend-que-guardam.md) | Guards de frontend que guardam | `E10` | Cobertura, vetores e a11y medindo o que importa |
| [08](08-baseline-git-verificado.md) | Baseline Git verificado | `P08` | O guard do `A01` cobre o cenário que o originou |
| [09](09-indice-trigram-no-modelo.md) | Índice trigram no modelo | `E08` | `--autogenerate` para de querer dropar o índice |
| [10](10-tipo-unico-de-dinheiro.md) | Tipo único de dinheiro | `P07` | `recipe_silver_cost` com um tipo só em toda a API |
| [11](11-retry-real-e-erro-visivel.md) | Retry real e erro visível | `E11` | Três telas ganham saída que não é F5 |
| [12](12-e2e-do-nucleo-do-produto.md) | E2E do núcleo do produto | `P05` | Refino, Craft, Calculadora e Preços na suíte real |
| [13](13-serving-e-deploy-do-frontend.md) | Serving e deploy do frontend | `P01` | SPA servida em produção, mesma origem, no Swarm |
| [14](14-abrir-calculadora-no-systray.md) | "Abrir Calculadora" no systray | `P02` | A premissa que a Fase 4 vai substituir |
| [15](15-decisao-sobre-a-20-4.md) | Decisão sobre a 20.4 | `P03` | Ordem que sumiu do mercado para de ser cotada, ou o limite fica escrito |
| [16](16-documentos-reconciliados.md) | Documentos reconciliados | `E09` `P06` | Specs param de descrever comportamento revogado |
| [17](17-higiene-de-repositorio-e-imagem.md) | Higiene de repositório e imagem | `P09` | Imagem sem log local, rotas internas fora do build, docs coerentes |

## Status

- [x] 01 — Aritmética decimal na entrada
- [ ] 02 — Entrada de filtro à prova de queda
- [ ] 03 — ErrorBoundary de verdade
- [ ] 04 — Erros de formulário na Calculadora
- [x] 05 — Formatação do client e gate verde
- [x] 06 — Contrato inglês completo
- [ ] 07 — Guards de frontend que guardam
- [x] 08 — Baseline Git verificado
- [x] 09 — Índice trigram no modelo
- [x] 10 — Tipo único de dinheiro
- [ ] 11 — Retry real e erro visível
- [ ] 12 — E2E do núcleo do produto
- [x] 13 — Serving e deploy do frontend
- [x] 14 — "Abrir Calculadora" no systray
- [x] 15 — Decisão sobre a 20.4
- [ ] 16 — Documentos reconciliados
- [x] 17 — Higiene de repositório e imagem

## Achados sem task própria

| # | Achado | Por quê |
|---|---|---|
| `P04` | Ranking filtra e ordena por `neutral_*` e exibe valor projetado | Decisão de arquitetura já tomada e documentada (3.5/23). Vira **item de validação humana** no gate da task 3/19: confirmar em jogo que o aviso do `RankingCoverage` deixa a diferença clara e que `min_profit` não engana. |

## Convenções específicas desta fase

- Herda todas as convenções da [Fase 3.5](../refatoracao/README.md#convenções-específicas-desta-fase).
- **Guard novo nasce vermelho.** Nenhuma task que adiciona teste ou regra de lint pode ser dada
  por concluída sem registrar, no bloco "Estado da implementação", a execução em que o guard
  falhou sobre o defeito real antes da correção.
- **Nada de refatoração oportunista.** Achado vizinho vira `W1`…`Wn` na tabela abaixo e task
  própria.
- Frontend: `npm run lint && npm run typecheck && npm run test` antes de concluir cada task.
- Backend: `uv run pytest tests/ -v && uv run ruff check .` antes de concluir cada task.
- Client Go: `go test ./... && scripts/validate-fmt.sh` antes de concluir; nunca `gofmt -w`
  indiscriminado — o upstream é CRLF.
- Toda task que altera OpenAPI regenera `frontend/src/api/schema.d.ts` no mesmo commit.

## Achados da fase

| # | Achado | Corrigido em |
|---|---|---|
| `W14` | `go vet` só roda em `ubuntu-latest` no `client-ci`, então nunca compila/analisa os arquivos `_win.go` — a plataforma real de produção. Achado localmente (`go vet ./client/` no Windows): `client/net_interface_filter_win.go:75: possible misuse of unsafe.Pointer`, herdado do upstream, sem `PATCH LOCAL`. Decisão da task 05: não adicionar job `windows-latest` sem antes triar esse achado — nasceria vermelho. | Aberto — sem task própria ainda |
