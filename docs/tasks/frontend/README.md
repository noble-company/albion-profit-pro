# Tasks — Fase 3 (calculadora web)

> ⏸ **Bloqueada pela Fase 2.5.** As specs abaixo continuam válidas, mas nenhuma deve ser
> implementada antes do gate de saída de
> [../estabilizacao/README.md](../estabilizacao/README.md). A Fase 2.5 altera contratos estruturais
> que o frontend consumirá, especialmente realm e semântica/cobertura do livro.

Microetapas da **Fase 3**, derivadas do [plano macro](../../00-plano-macro.md) e revisadas
contra o backend real em 2026-08-23. A pasta se chama `frontend` porque a entrega da fase é a
aplicação web, mas as tasks 01-05 completam primeiro a API que essa aplicação precisa.

**Objetivo da fase:** entregar o fluxo autenticado `buscar item → consultar mercado → simular
craft/refino → comparar cidades e rotas`, reutilizando a mesma regra de negócio numa futura UI do
client.

## Decisões revisadas

- O motor monetário fica no backend (`src/craft/`); o frontend não refaz contas.
- APIs recebem o `Item.unique_name` canônico, incluindo `@N` quando encantado. Não há um segundo
  campo de encantamento capaz de contradizer o identificador.
- Execução imediata consome níveis reais do livro (slippage); preço melhor × quantidade inteira é
  apenas uma estimativa e não pode ser apresentado como custo executável.
- A simulação devolve quatro cenários: insumo imediato ou buy order × venda imediata ou sell order.
- Setup fee default é 2,5% tanto com quanto sem Premium; Premium altera o imposto de venda (4% vs.
  8%). Os defaults continuam editáveis e serão confirmados in-game na task 19.
- Upgrade para `.N` é encadeado por nível (`.0 → .1 → ... → .N`), pois cada linha de receita
  descreve o recurso para subir do nível anterior.
- `server` (`west`/`east`/`europe`) é obrigatório em todo endpoint de mercado desde a estabilização
  task 03 e não tem default por usuário no backend. O frontend guarda a escolha como estado global
  no shell (task 09) e a repassa em toda chamada de preço/demanda/craft — não é um campo de
  formulário por tela.
- “Demanda” significa unidades/ordens e volume vendido; o sistema não conhece compradores únicos.
- Stack inicial: React 19, Vite 8, TypeScript 5.9, React Router 8, Tailwind CSS 4, shadcn/ui,
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

ETAPA 2 — produto
09 ─┬─ 10 Tokens
    ├─ 11 Busca ── 12 Preços ── 13 Demanda
    └─ 14 Calculadora ── 15 Comparativo
                         └─ 16 Estados de borda

ETAPA 3 — fechamento
17 E2E ── 18 Build/serving ── 19 Validação in-game
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
| [15](15-comparativo.md) | Comparativo | frontend | Ranking e rotas encantadas |
| [16](16-estados-borda.md) | Resiliência | frontend | Estados esperados e indisponibilidade |
| [17](17-e2e-playwright.md) | E2E | integração | Fluxos reais contra datastore real |
| [18](18-build-producao.md) | Build de produção | frontend/backend | SPA na imagem da API |
| [19](19-validacao-ponta-a-ponta.md) | Fechamento | manual | Jogo → client → UI + conta à mão |

## Status — Fase 3

- [ ] 01 — Catálogo de itens e localizações
- [ ] 02 — API de receitas
- [ ] 03 — Contrato e fórmulas de cálculo
- [ ] 04 — Motor de simulação
- [ ] 05 — Comparação de cidades e rotas de encantamento
- [ ] 06 — Scaffold do frontend
- [ ] 07 — Camada de API tipada
- [ ] 08 — Autenticação no frontend
- [ ] 09 — Shell e design system
- [ ] 10 — Tokens do client Go
- [ ] 11 — Busca de itens
- [ ] 12 — Preços por cidade
- [ ] 13 — Demanda e histórico
- [ ] 14 — Calculadora
- [ ] 15 — Comparativo de cidades e encantamento
- [ ] 16 — Estados de borda e resiliência
- [ ] 17 — Suíte E2E Playwright
- [ ] 18 — Build de produção e serving
- [ ] 19 — Validação ponta a ponta e fechamento

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
- Uma task que altera OpenAPI também regenera e commita `frontend/src/api/schema.d.ts` se o
  frontend já existir.

## Achados da fase

| # | Achado | Corrigido em |
|---|---|---|
| `W1` | As specs 04/05/09/12-15 foram escritas antes da estabilização tasks 03 e 05 fecharem. `server` virou obrigatório em `/items/{id}/prices` e `/items/{id}/demand` sem nenhum default por usuário no backend, e `scope=mine` passou a ter cobertura independente entre livro e histórico. Revisado em 2026-08-23 contra o código real (`prices/router.py`, `prices/schemas.py`). | Tasks 04, 05, 09, 12, 13, 14, 15 (specs atualizadas) |
