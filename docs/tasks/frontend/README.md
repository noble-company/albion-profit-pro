# Tasks — Fase 3 (calculadora web)

> ▶ **Próxima fase.** A Fase 2.5 foi concluída em 14/14; estas specs já incorporam seus contratos
> finais, especialmente realm, seed reproduzível e semântica/cobertura do livro.

Microetapas da **Fase 3**, derivadas do [plano macro](../../00-plano-macro.md) e revisadas
contra o backend real em 2026-08-23. A pasta se chama `frontend` porque a entrega da fase é a
aplicação web, mas as tasks 01-05 completam primeiro a API que essa aplicação precisa.

**Objetivo da fase:** entregar um scanner autenticado de oportunidades: `Market Flip → Refino →
Craft`, com rankings rápidos e análise detalhada opcional. Busca, preços, demanda e calculadora
formam a fundação usada ao abrir uma oportunidade.

## Decisões revisadas

- O motor monetário fica no backend (`src/craft/`); o frontend não refaz contas.
- APIs recebem o `Item.unique_name` canônico, incluindo `@N` quando encantado. Não há um segundo
  campo de encantamento capaz de contradizer o identificador.
- Execução imediata consome níveis reais do livro (slippage); preço melhor × quantidade inteira é
  apenas uma estimativa e não pode ser apresentado como custo executável.
- A simulação devolve quatro cenários: insumo imediato ou buy order × venda imediata ou sell order.
- Setup fee default é 2,5% tanto com quanto sem Premium; Premium altera o imposto de venda (4% vs.
  8%). Os defaults foram confirmados pelo responsável do produto em 2026-08-23 e continuam
  editáveis; retorno e estação são inputs do jogador.
- Upgrade para `.N` é encadeado por nível (`.0 → .1 → ... → .N`), pois cada linha de receita
  descreve o recurso para subir do nível anterior.
- `server` (`west`/`east`/`europe`) é obrigatório em todo endpoint de mercado desde a estabilização
  task 03 e não tem default por usuário no backend. O frontend guarda a escolha como estado global
  no shell (task 09) e a repassa em toda chamada de preço/demanda/craft — não é um campo de
  formulário por tela.
- “Demanda” significa unidades/ordens e volume vendido; o sistema não conhece compradores únicos.
- Stack inicial: React 19, Vite 8, TypeScript 6, React Router 8, Tailwind CSS 4, shadcn/ui,
  TanStack Query 5, RHF/Zod, Vitest/RTL/MSW e Playwright. Versões exatas ficam travadas no
  `package-lock.json` e são revalidadas na task 06.

## Ordem de implementação

```text
ETAPA 0 — completar o backend
01 Catálogo + localizações
  └─ 02 API de receitas
03 Contrato e fórmulas (paralelo a 01-02)
  └─ 04 Simulação (depende de 01-03)
       └─ 05 Comparação de cidades e encantamento

ETAPA 1 — fundação web
06 Scaffold
  └─ 07 API tipada (após OpenAPI das tasks 01-05)
       └─ 08 Autenticação
            └─ 09 Shell e design system

ETAPA 2 — fundação de detalhe
09 ─┬─ 10 Tokens
    ├─ 11 Busca ── 12 Preços ── 13 Demanda
    └─ 14 Calculadora (análise detalhada)

ETAPA 3 — produto principal
15 Motor agregado de oportunidades
    ├─ 16 Dashboard Market Flip
    └─ 17 Rankings Refino + Craft

ETAPA 4 — fechamento
18 Resiliência + E2E ── 19 Build, serving e validação real
```

## Lista

| # | Task | Onde | Entrega |
|---|---|---|---|
| [01](01-catalogo-itens-localizacoes.md) | Catálogo e localizações | backend | Busca indexada, detalhe e cidades |
| [02](02-api-receitas.md) | API de receitas | backend | Receita ordenada e variantes |
| [03](03-contrato-calculo-craft.md) | Contrato de cálculo | docs/backend | Fórmulas, arredondamento e taxas |
| [04](04-motor-simulacao.md) | Motor de simulação | backend | `POST /craft/simulate` e quatro cenários |
| [05](05-comparacao-cidades-encantamento.md) | Comparações | backend | Cidades e rotas de encantamento |
| [06](06-scaffold-frontend.md) | Scaffold web | frontend | React/Vite/TS e testes base |
| [07](07-camada-api-tipada.md) | API tipada | frontend | OpenAPI gerado + cliente HTTP |
| [08](08-autenticacao-frontend.md) | Autenticação | frontend | Registro, login e sessão |
| [09](09-shell-design-system.md) | Shell/design system | frontend | Rotas, layout, tema e formatadores |
| [10](10-tokens-client.md) | Tokens do client | frontend | Criar, listar, copiar e revogar |
| [11](11-busca-itens.md) | Busca de itens | frontend | Autocomplete e filtros |
| [12](12-precos-cidade.md) | Preços por cidade | frontend | Livro por lado, qualidade e cobertura |
| [13](13-demanda-historico.md) | Demanda e histórico | frontend | Métricas e série de 6 h |
| [14](14-calculadora.md) | Calculadora | frontend | Formulário e breakdown de cenários |
| [15](15-motor-oportunidades.md) | Motor de oportunidades | backend | Rankings agregados de flip, refino e craft |
| [16](16-dashboard-market-flip.md) | Dashboard Market Flip | frontend | Filtros, KPIs e tabela de arbitragem |
| [17](17-rankings-refino-craft.md) | Rankings Refino + Craft | frontend | Abas de refino e fabricação lucrativa |
| [18](18-resiliencia-e2e.md) | Resiliência e E2E | integração | Estados de produto e fluxos Playwright |
| [19](19-build-validacao.md) | Build e validação final | frontend/backend/manual | Serving, jogo real e fechamento |

## Status — Fase 3

- [x] 01 — Catálogo de itens e localizações
- [x] 02 — API de receitas
- [x] 03 — Contrato e fórmulas de cálculo
- [x] 04 — Motor de simulação
- [x] 05 — Comparação de cidades e rotas de encantamento
- [x] 06 — Scaffold do frontend
- [x] 07 — Camada de API tipada
- [x] 08 — Autenticação no frontend
- [x] 09 — Shell e design system
- [x] 10 — Tokens do client Go
- [x] 11 — Busca de itens
- [x] 12 — Preços por cidade
- [x] 13 — Demanda e histórico
- [x] 14 — Calculadora
- [x] 15 — Motor agregado de oportunidades
- [x] 16 — Dashboard Market Flip
- [x] 17 — Rankings Refino + Craft
- [x] 18 — Resiliência e E2E — **entregue** pela [Fase 3.5, task 27](../refatoracao/27-e2e-playwright.md) (suíte Playwright contra a stack real)
- [x] 19 — Build e validação final — implementação entregue pela [Fase 3.6, task 13](../correcoes/13-serving-e-deploy-do-frontend.md); ensaio integrado em jogo concluído em 2026-09-23 (ver "Estado da implementação" em [19-build-validacao.md](19-build-validacao.md))

> ⚠️ **Fase 3 pausada em 2026-08-30.** A auditoria em
> [12-revisao-fase-3.md](../../12-revisao-fase-3.md) encontrou defeitos de correção e de
> fundação que tornariam o fechamento da fase inútil: o ranking de refino/craft está truncado
> nas 200 primeiras receitas em ordem alfabética (`B02`), o flip cota ordens expiradas (`B03`),
> a biblioteca de componentes decidida na task 09 nunca foi instalada (`F01`) e recarregar a
> página desloga o usuário (`F07`). A [Fase 3.5](../refatoracao/README.md) corrige isso antes
> de 18 e 19 serem executadas.

### Extensão transversal 3.1 — snapshots e preços atuais

O plano está documentado em [20 — snapshots e preços atuais](20-snapshot-precos-atuais.md).
Estas tasks entram na Fase 3 e devem ser executadas antes da validação final da fase, pois
alteram o contrato de preço consumido por Market Flip, Refino, Craft e Calculadora.

- [x] 20.1 — Contrato de snapshot
- [x] 20.2 — Client Go e envio de snapshots
- [x] 20.3 — Projeção da última observação por combinação

> As tasks 20.4-20.11 foram adiadas para depois da Fase 3.5 e **reconciliadas na
> [task 3.5/28](../refatoracao/28-retomada-dos-snapshots.md)** (2026-09-06). A arquitetura
> escolhida foi a **projeção da última observação (20.3), não snapshots persistidos** — a
> Fase 3.5 já entregou a substância de 20.5/20.7/20.8/20.9/20.10 ao reescrever os motores e as
> telas sobre essa projeção. Ver a coluna "onde" abaixo.

- [~] 20.4 — Reconciliação transacional do estado atual — **bloqueada no client Go**. A
  inativação de ordem por ausência precisa do client emitir snapshot vazio + `Scope` explícito
  (adiado na 20.2, "Limitação conhecida"). No interino, "ordem que sumiu" é coberto por
  expiração + janela de frescor + a projeção da última observação. Reabre quando o client fizer
  a parte adiada da 20.2.
- [x] 20.5 — Serviço único de preço atual — **Fase 3.5/05** (`src/craft/quotes.py`, fronteira
  única de cotação) + projeção 20.3. A camada "e se" do cliente (3.5/23) consome os mesmos
  componentes neutros.
- [x] 20.6 — Invalidação de cache e pub/sub — **superada pela Fase 3.5/08** (Opção B: pub/sub
  removido). Invalidação = `recompute_and_cache_book` + TTL curto; atualização = polling de 30s
  no front (3.5/15).
- [x] 20.7 — Política de frescor — **Fase 3.5/03 e 3.5/07**. `latest_order_observation_filter`,
  `age_seconds`, `freshness_window_seconds`, `coverage.stale`, `require_complete`, warning
  `dado_velho` no flip, teto de frescor na UI.
- [x] 20.8 — Estados do frontend — **Fase 3.5/14 e 3.5/21-25**. `EstadoVazio`/`EstadoErro`,
  `RankingCoverage`, `formatarIdade`, selects de frescor limitados, `axe` verde.
- [x] 20.9 — Migração dos motores — **Fase 3.5/02, 3.5/03, 3.5/05**. Flip, Refino, Craft e
  Calculadora rodam sobre a projeção; nenhum consulta ordem histórica direto.
- [x] 20.10 — Testes automatizados — substituição/remoção/vazio/frescor cobertos em
  `tests/prices/test_service.py`, `tests/craft/test_quotes.py`, `tests/craft/test_simulate_router.py`,
  `tests/opportunities/test_flips.py`; os critérios de aceite do 20.1/20.3 no limite HTTP em
  `tests/prices/test_current_price_projection_acceptance.py` (novo, Fase 3.5/28).
- [x] 20.11 — Validação real no jogo — concluída junto do gate da task 19, em 2026-09-23.

## Convenções específicas desta fase

- Nada de refatoração oportunista. Achado vizinho vira `W1`…`Wn` neste README e uma task própria.
- Frontend: `npm run lint && npm run typecheck && npm run test` antes de concluir cada task.
- Backend: `uv run pytest tests/ -v && uv run ruff check .` antes de concluir cada task.
- TypeScript `strict`, `noUncheckedIndexedAccess` e nenhum `any`. Tipos da borda vêm do OpenAPI.
- Dinheiro viaja como string decimal. O frontend apenas formata, sem converter para `number` nem
  executar aritmética monetária.
- Todo lado com preço mostra `observado_em` e `idade_segundos`; `null` é “sem observação fresca”,
  nunca “agora”. A UI deve declarar `cobertura: parcial` sem chamar os totais de profundidade total.
- Teste unitário do frontend usa MSW; E2E usa API, PostgreSQL, Redis e RabbitMQ reais.
- A geração inicial de `frontend/src/api/schema.d.ts` pertence à Task 07, depois das APIs 01–05.
  Após esse arquivo existir, toda task que alterar OpenAPI também o regenera.

## Achados da fase

| # | Achado | Corrigido em |
|---|---|---|
| `W1` | As specs 04/05/09/12-15 foram escritas antes da estabilização tasks 03 e 05 fecharem. `server` virou obrigatório em `/items/{id}/prices` e `/items/{id}/demand` sem nenhum default por usuário no backend, e `scope=mine` passou a ter cobertura independente entre livro e histórico. Revisado em 2026-08-23 contra o código real (`prices/router.py`, `prices/schemas.py`). | Tasks 04, 05, 09, 12, 13, 14, 15 (specs atualizadas) |
| `W2` | O seed estático considera o checksum do manifesto para decidir `unchanged`; mudar apenas importadores deixaria instalações existentes sem novas colunas derivadas/ordens. | Tasks 01 e 02 exigem revisão da identidade da transformação e teste de upgrade já semeado |
| `W3` | O nome planejado `docs/05-formulas-de-craft.md` colidia com a auditoria existente e o gate humano adiado na Fase 2.5 ainda não estava integralmente na Task 19. | Documento renumerado para `11`; gate consolidado na Task 19 |
| `W4` | Recursos encantados usam `_LEVELN` no `ITEM DUMP.json`, mas `_LEVELN@N` no catálogo e no mercado; o import anterior deixava 39 outputs canônicos e ingredientes encantados sem ID. | Task 02 normaliza somente candidatos comprovados em `items.json`; 39 outputs sem correspondência real permanecem documentados |
| `W5` | As cotações executáveis da Task 04 carregavam o instante internamente, mas não o publicavam, impedindo o comparativo/UI de mostrar idade real por nível consumido. | Task 05 acrescenta `observed_at`, `oldest_observed_at` e `age_seconds` sem alterar fórmulas ou cenários |
| `W6` | `openapi-typescript@7.13.0` declara peer de TypeScript 5, enquanto o scaffold validado usa TypeScript 6. | Task 07 mantém TypeScript 6 e instala o gerador com compatibilidade explícita; geração, typecheck e build passaram |
| `W7` | A especificação cita React Router 8, mas o scaffold mantém Router 7.18.2 por compatibilidade validada com Node 22.15. | Task 09 preserva a decisão da Task 06; API usada é compatível com as rotas implementadas |
