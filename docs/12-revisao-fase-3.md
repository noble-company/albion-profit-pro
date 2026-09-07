# Revisão da Fase 3 — frontend, motor de oportunidades e arquitetura de cálculo

> Auditoria feita em 2026-08-30 sobre o backend (`src/` inteiro), o frontend (`src/` inteiro),
> a documentação e o estado do Git. Sucede a [revisão das Fases 0 a 2](05-revisao-fases-0-a-2.md)
> e origina a [Fase 3.5 — refatoração](tasks/refatoracao/README.md).
>
> Motivador: o frontend entregue nas tasks 06–17 está visualmente pobre e desorganizado, e o
> produto parece lento ao mexer nos controles. A auditoria confirma as duas percepções e
> encontra a causa — que **não** é a escolha de framework.

## Verificações executadas

- `npx tsc -b` (frontend) — passou.
- `npx eslint .` (frontend) — passou, 7 warnings (`react-refresh`, `exhaustive-deps`).
- `npx vitest run` (frontend) — **24 testes em 9 arquivos**, todos verdes.
- Leitura integral de `backend/src/` (6.524 linhas) e `frontend/src/` (5.220 linhas de app).
- `git ls-files`, `git status`, `git check-ignore` sobre a árvore inteira.
- `uv run pytest` **não** foi executado nesta auditoria (exige Docker/testcontainers). A
  contagem de 258 testes vem de inspeção estática de `backend/tests/`.
- Nenhum teste em jogo real foi repetido.

Como na revisão anterior: testes verdes confirmam o que cobrem, e **não** cobrem os defeitos
abaixo. O achado `F07` é justamente um teste verde escondendo um bug de produção.

## Achados

Prefixos: `A` arquitetura/processo, `B` backend, `F` frontend, `S` segurança.

| ID | Severidade | Achado | Consequência | Task |
|---|---|---|---|---|
| `A01` | Crítica operacional | `frontend/` inteiro está fora do Git (`git ls-files frontend` → 0), sem estar no `.gitignore`. O mesmo vale para `src/craft/`, `src/opportunities/`, `src/recipes/service.py`, `src/items/router.py`, 5 migrations e as specs 15–20.3. O repo tem 2 commits. | Toda a Fase 3 existe só no disco local. Regressão de `R03`, que a task 2.5/01 dava por resolvida. | 01 |
| `A02` | Média | `README.md` da raiz diz "frontend — ainda não criado; próximo passo"; o plano macro e o README de tasks divergem do estado real. | Onboarding parte de premissa falsa. Repete o padrão de `R14`. | 29 |
| `A03` | Média | `playwright.config.ts` aponta `testDir: './e2e'`, e a pasta não existe. | `npm run test:e2e` falha; a task 18 da Fase 3 nunca começou. | 27 |
| `B01` | Crítica | `flip_opportunities` carrega **todas** as ordens do realm sem `LIMIT`, com subquery correlacionada por linha, e cruza os grupos em **laço aninhado** (O(n²)); ordena e pagina em Python. | Com ~5.000 combinações são 25 M de iterações por request — e o frontend chama a cada 30 s, por aba. Gargalo nº 1 do produto. | 02 |
| `B02` | Crítica | `recipe_opportunities` limita candidatos a `.limit(200)` ordenado por `output_item_unique_name` (**alfabética**), sobre 5.633 receitas, sem avisar. Depois roda até 8.000 `simulate_craft` **sequenciais** por request. | O "melhor refino do servidor" é o melhor entre os 200 primeiros do alfabeto. Falha de correção na proposta central do produto. | 03 |
| `B03` | Alta | `flip_opportunities` não filtra `MarketOrder.expires > now` (o motor de craft filtra). | A tela principal pode recomendar compra numa ordem que já não existe no jogo. | 02 |
| `B04` | Alta | `OpportunityOut.gross_revenue` carrega valor **líquido** em `/flips` e **bruto** em `/refining`/`/crafting`. | Mesmo campo, semântica invertida. Obriga o frontend a reconstruir as taxas por engenharia reversa (`F09`). | 04 |
| `B05` | Média | `require_complete` descarta só `dado_velho` no flip e qualquer aviso na produção. | O mesmo checkbox "Cobertura completa" faz coisas diferentes em duas telas. | 04 |
| `B06` | Média | Flip usa uma única melhor oferta e `qty = min(amount, amount)` sem teto; o craft caminha a profundidade real do livro. | Dois modelos de preço no mesmo produto; o flip anuncia volume que não é executável. | 02 |
| `B07` | Média | `opportunities/service.py` redeclara `PREMIUM_SALES_TAX`, `NON_PREMIUM_SALES_TAX`, `SETUP_FEE` e um `_charge()` próprio em vez de usar `craft/constants.py` + `calculate_percentage_charge`. Também crava `6 * 3600` em vez de `price_freshness_hours`. | Duas fontes de verdade para imposto e frescor; divergem no primeiro patch da SBI. | 05 |
| `B08` | Média | `compare_service.py` importa `QuoteResult`, `_manual_side`, `_ordered_warnings`, `_quote` — privados de `craft/service.py`. | Fronteira de módulo furada; refatorar `service.py` quebra `compare_service.py` silenciosamente. | 05 |
| `B09` | Média | `/items/{id}/prices` e `/demand` respondem em português (`venda`, `compra`, `cobertura`); `/craft/*` e `/opportunities/*` em inglês. `CLAUDE.md` manda inglês em identificadores. | O frontend mistura os dois idiomas no mesmo componente. | 07 |
| `B10` | Média | `publish_price_update()` roda no caminho quente de todo ingest, mas **não existe** endpoint WebSocket/SSE; o frontend faz polling de 30 s. | Custo pago, benefício nunca entregue. Promessa aberta do plano macro. | 08 |
| `B11` | Baixa | `_is_refining_item` classifica por substring (`resource`/`refin`/`material`) em `shop_category`; o filtro SQL usa `ilike '%...%'`. | Item novo cai na aba errada; o filtro não usa índice. | 09 |
| `F01` | Crítica de produto | `components.json` configura shadcn/ui (new-york, lucide), mas o `package.json` **não tem** `@radix-ui/*`, `class-variance-authority` nem `lucide-react`. `components/ui/` só tem `states.tsx` e `ToastProvider.tsx`. | Não existe Button, Card, Table, Dialog, Badge, Tooltip — nem um ícone. A UI usa `☰`, `×`, `⇄`, `↗` como texto. **É a causa direta da aparência amadora.** | 11 |
| `F02` | Crítica de produto | `index.css` define só `--font-sans`. Toda cor é literal (`bg-stone-950`, `#fbbf24`, `rgb(12 10 9 / 75%)`), e há CSS de componente hardcoded (`.filter-toggle`, `.toggle-track`, `.button`) competindo com Tailwind. | Sem tokens, mudar a identidade visual é editar centenas de strings. Dois sistemas de estilo no mesmo projeto. | 12 |
| `F03` | Alta | `ThemeContext` aplica `.dark` e `data-theme`, mas há **zero** classes `dark:` no projeto e `:root` fixa `color-scheme: dark`. | Escolher "Claro" ou "Sistema" não muda nada. Controle que mente para o usuário. | 13 |
| `F04` | Alta | TanStack Query está instalado e `queryPolicies` definido — e **nada** usa `queryPolicies`; só `tokens/hooks.ts` usa `useQuery`. O resto é ~230 linhas de `useState`/`useEffect`/`AbortController`/`setInterval` à mão. | Sem cache, sem dedup (`getLocations` buscado 3×), polling em aba oculta, e `setData(null)` faz a tabela piscar a cada tecla. | 15 |
| `F05` | Alta | `Kpi`, `Checkbox`, `Select` e `updateParam` estão copiados byte a byte entre `opportunities/pages.tsx` (699 l.) e `production-pages.tsx` (862 l.). O default de `profitOnly` diverge entre as duas (`=== 'true'` vs `!== 'false'`). | 1.561 linhas fazendo a mesma coisa, já divergindo em comportamento. | 20 |
| `F06` | Média | Três mapas de cidade concorrentes (`formatters.ts`, `opportunities/pages.tsx`, `prices/pages.tsx`) discordam entre si sobre Lymhurst (`1002`/`1301`) e sobre o covil ("Covil do Inferno" vs "Hell Den"), enquanto `/locations` e a tabela `location` já são autoridade. `formatarLocalidade` inventa o literal "Mercado" para ID desconhecido. | Nomes de cidade inconsistentes entre telas; a UI mente em vez de mostrar o ID. | 19 |
| `F07` | Alta | `readStoredToken()` lê o `sessionStorage` mas **nunca** chama `setAccessToken()`, e o interceptor lê de uma variável de módulo. Após F5, `GET /auth/me` sai sem `Authorization` → 401 → "Sua sessão expirou". O teste `restaura uma sessão válida armazenada na aba` **passa porque o handler MSW devolve o usuário sem checar o header**. | Recarregar a página desloga o usuário, com um teste verde escondendo o defeito. | 16 |
| `F08` | Alta | O servidor pagina e ordena; o cliente **re-ordena as 25 linhas recebidas**. "ROI (maior → menor)" ordena o ROI dentro da página 1 do ranking de lucro. Em `prices/pages.tsx`, qualidade/encantamento filtram **depois** da paginação. | Ordenação e contadores mentem; a página pode vir vazia havendo resultados. | 17 |
| `F09` | Média | `rows.reduce((sum, row) => sum + Number(row.profit ?? 0), 0)` e a coluna "Taxas" com quatro `Number()` encadeados — contra a regra escrita no próprio README da fase ("o frontend apenas formata"). | Perda de precisão em prata; a coluna só existe porque a API não devolve o campo (`B04`). | 18 |
| `F10` | Baixa | `lazy(() => Promise.resolve({ default: MarketFlipPage }))` com a página já importada estaticamente no topo. | `Suspense` sem nenhum code splitting. Ritual sem efeito. | 25 |
| `F11` | Média | `DetailDrawer` sem trap de foco, `Esc` ou scroll lock; `ToastProvider` com uma mensagem só, sem fila nem auto-dismiss; `useItemPrices` cria `new AbortController().signal` inline e descarta (nada é cancelado) e nunca limpa o erro; `useBuscaItens` recebe `filters` (objeto) nas dependências; `formatarNomeJogador` formata item, não jogador; `EstadoErro onRetry={() => undefined}`. | Acessibilidade quebrada e uma coleção de detalhes que somam a sensação de descuido. | 25 |
| `F12` | Média | 24 testes para 5.220 linhas, quase todos em auth/formatters. As duas telas maiores (1.561 l.) têm 205 linhas de teste. Nenhum teste de ordenação, paginação, filtro ou hooks de dados. | Refatorar as telas hoje é feito sem rede de proteção. | 26 |
| `S01` | Alta | Registro aberto, sem verificação de e-mail (`current_active_user` exige `active`, não `is_verified`) → qualquer um gera token de ingest. `market_order` e `market_history_entry` são **globais**, sem dono e sem detecção de outlier. | Um agente hostil ou um client bugado corrompe o preço que todos veem, sem rollback possível. | 10 |
| `S02` | Alta | `/opportunities/*` não tem rate limit e é o endpoint mais caro do sistema (`B01`/`B02`). | Registro aberto + endpoint O(n²) = DoS com um laço de `curl` autenticado. | 06 |
| `S03` | Média | JWT em `sessionStorage`, exposto a XSS; mitigação real é cookie `httpOnly`+`SameSite`. | Risco hoje indireto (dependência comprometida), mas é dívida a assumir conscientemente. | 06 |
| `S04` | Média | `CORSMiddleware` com `allow_credentials=True` e `cors_origins` vindo de env **sem validador** — ao contrário de `trusted_proxy_cidrs`, que rejeita `/0`. | `CORS_ORIGINS=["*"]` em produção vira eco de origem com credenciais. | 06 |
| `S05` | Média | Sem limite de tokens por usuário em `POST /auth/tokens`. | Superfície de abuso maior que o necessário. | 06 |
| `S06` | Produto | Todo o catálogo exige login, inclusive `/locations` e `/items/categories`. | Sem landing page, sem SEO, sem "experimentar antes de criar conta". Trava aquisição de usuário. | Em aberto |

## O que a auditoria confirma como bem feito

Inventário do que precisa ser **preservado** — não elogio de cortesia:

1. **`craft/formulas.py`** — funções puras sem banco, `Decimal` em tudo, validação de entrada,
   arredondamento explícito por taxa (`ROUND_CEILING`), testadas isoladamente e com contrato
   documentado em [11-formulas-de-craft.md](11-formulas-de-craft.md).
2. **`craft/service.py`** — cotação que caminha a **profundidade real do livro** (comprar 200
   unidades consome vários níveis, não `melhor_preço × 200`), quatro cenários e taxonomia
   estável de avisos. É o diferencial contra calculadoras genéricas.
3. **`prices/service.py`** — `latest_order_observation_filter()`, cobertura por usuário via
   `market_scan` sem sujar a tabela-fato, rollups com média ponderada por volume.
4. **Segurança do ingest** — token hasheado, rate limit com Lua atômico, `X-Forwarded-For` só
   de CIDR confiável, HMAC para tentativa inválida, validação estrita casando o wire do Go.
5. **Operação Celery** — filas duráveis, `acks_late`, `reject_on_worker_lost`, quarentena no
   Postgres, time limits por task.

**O backend não é a causa do problema percebido.** Tem defeitos pontuais de performance e
contrato, mas a fundação está certa.

## Decisões de arquitetura da Fase 3.5

Tomadas com o responsável do produto em 2026-08-30.

### 1. O cálculo é dividido por *o que muda*, não por *onde roda*

A proposta inicial era mover todo o cálculo para o frontend e deixar o backend só servindo
preço. O diagnóstico por trás dela está correto: hoje **marcar um checkbox dispara até 8.000
simulações no servidor**, e isso é arquitetura errada — são transformações baratas sobre dados
que o navegador já tem.

A conclusão total, porém, não se sustenta por quatro razões medidas:

- Ranking exige avaliar milhares de receitas × 8 cidades × 5 qualidades; para o navegador
  fazer isso seria preciso **baixar o livro de ofertas inteiro**.
- JavaScript não tem decimal nativo; reescrever o motor com `number` introduz erro que se
  acumula, e passam a existir duas implementações do dinheiro que vão divergir.
- O cálculo de slippage precisa de todos os níveis de preço de cada item.
- Descartaria o único módulo do repositório com testes puros e documento de contrato próprio.

**Divisão adotada:**

| Camada | Onde | Racional |
|---|---|---|
| Varredura e ranking | Servidor, **pré-calculado em background** | Precisa do universo. Leitura vira `SELECT ... ORDER BY ... LIMIT`. |
| Preço atual de um conjunto de itens/cidades | Servidor, endpoint único | É o "backend só traz preço". Converge com a task 20.5. |
| "E se…" — premium, retorno, estação, impostos, lucro mínimo, ordenação | **Cliente, instantâneo** | Os dados já estão na página. Zero round-trip. |
| Detalhe de um item (4 cenários com slippage) | Servidor, sob demanda | Uma requisição, ao clique. Precisa do livro completo. |

**Guarda-corpo obrigatório:** o módulo de cálculo do cliente é acompanhado de uma suíte de
**vetores dourados gerada a partir do motor Python**. Mesmos insumos, mesmos resultados,
verificados dos dois lados. Mudar uma taxa em um lugar só quebra o teste. É isso que permite
cálculo no cliente sem ter duas verdades.

### 2. O frontend é reconstruído por cima, não recomeçado

React 19 + Vite + TypeScript + Tailwind **não** é a causa da feiura. A causa é `F01`/`F02`/`F03`:
a camada de componentes foi decidida e nunca instalada, e não existem tokens. Trocar de
framework custaria semanas e reproduziria o mesmo resultado, porque falta disciplina de design
system, não tecnologia. Auth, cliente OpenAPI tipado e testes existentes são preservados.

### 3. Antifraude de mercado é adiada conscientemente

`S01` é real e alto, mas a task fica **escrita, aberta e priorizada para antes do lançamento
público** — não implementada agora. Enquanto a base de usuários for pequena e conhecida, o
risco é aceito de forma explícita. Duas medidas baratas entram já, porque servem a outros
fins: registrar `api_token_id` na procedência (permite invalidar a contribuição de um token
depois) e o rate limit de `S02`, que corta o vetor de DoS independentemente de fraude.

### 4. Dinheiro continua string decimal na borda

A regra já escrita no README da Fase 3 passa a ser verificada por teste, não por convenção
(`F09`). O cliente pode calcular — mas com um tipo decimal, nunca com `number`.

## Fora do escopo desta fase

- Trocar framework de frontend ou empacotar aplicativo desktop (Tauri fica para fase própria).
- Abrir o catálogo sem autenticação (`S06`) — decisão de produto ainda em aberto.
- Implementar `GoldPrice`; segue fora de escopo desde 2026-08-22.
- Modelar as ~3.200 receitas alternativas puladas; segue pendência de
  [02-dados-de-receita.md](02-dados-de-receita.md).
- Retomar captura de craft/refino em tempo real.

## Desfecho dos achados — 2026-09-06

Fechamento da Fase 3.5 (task 29). Cada achado com a task que o resolveu e o desfecho real,
no mesmo espírito das revisões [04](04-revisao-fase-1.md) e [05](05-revisao-fases-0-a-2.md).

### Arquitetura e onboarding

| # | Task | Desfecho |
|---|---|---|
| `A01` | 01 | Toda a Fase 3 versionada em commits coerentes e publicada. Critério de baseline redefinido (remote **+** árvore sem fonte não rastreada); agora verificado por `scripts/verify_repository.py`. |
| `A02` | 29 | Esta task. `README.md`, `CLAUDE.md`, `AGENTS.md`, `docs/00-plano-macro.md` e os READMEs de tasks reconciliados com a realidade. |
| `A03` | 27 | `frontend/e2e/` criado — suíte Playwright (10 specs) contra API + PostgreSQL + Redis reais; `frontend-e2e.yml` no CI. Substitui a task 18 da Fase 3, que nunca começou. |

### Motor de oportunidades e cálculo (backend)

| # | Task | Desfecho |
|---|---|---|
| `B01` | 02 | `flip_opportunities` reescrito como 1 consulta em CTEs — janela de última observação, self-join compra×venda, lucro/paginação no Postgres. 2 statements/request, constante. `EXPLAIN` ~25 ms / 6 mil candidatos. **Validado ao vivo.** |
| `B02` | 03 | Tabela materializada `recipe_ranking` + job Celery `*/10` (fila `maintenance`), sem `.limit(200)` — cobertura total. Leitura = count + SELECT paginado + projeção barata. `EXPLAIN` ~0,6 ms / 400 linhas. |
| `B03` | 02 | Flip filtra `expires > now()` nos dois lados. |
| `B04` | 04 | `gross_revenue` passa a ser o bruto real nas três rotas; `sales_tax`, `sale_setup_fee`, `net_revenue`, `acquisition_setup_fee`, `total_fees` no contrato. Fim da engenharia reversa no front (`F09`). |
| `B05` | 04 | `require_complete` com uma semântica só nos três endpoints. |
| `B06` | 02 | `price_model="top_of_book"`; `qty ≤ profundidade` do melhor nível; sem anunciar volume não executável. |
| `B07` | 05 | `opportunities/service.py` lê as rates por atributo de módulo de `craft/constants.py` e o frescor da policy. Uma fonte de verdade. |
| `B08` | 05 | `src/craft/quotes.py` — fronteira pública (`QuoteResult`, `quote`, `manual_side`, `ordered_warnings`). Zero import de `_privado` cruzando módulo, verificado por teste de AST. |
| `B09` | 07 | `/items/{id}/prices` e `/demand` traduzidos; `sell`/`buy`, `best_price`, `coverage`, `series_6h`. `test_api_language.py` varre o OpenAPI. |
| `B10` | 08 | **Opção B:** `publish_price_update` removido do caminho quente **e** apagado. Polling de 30 s mantido. `docs/00-plano-macro.md` corrigido. |
| `B11` | 09 | `Recipe.production_kind` derivado de `@shopsubcategory1 == "refinedresources"` no import (migração + índice). 40 receitas reclassificadas vs a heurística de substring. |

### Frontend

| # | Task | Desfecho |
|---|---|---|
| `F01` | 11 | shadcn/ui de verdade — Radix + `class-variance-authority` + `lucide-react` instalados; Button, Card, Table, Dialog, Sheet, Badge, Tooltip, Select em `components/ui/`. Fim dos ícones em texto. |
| `F02` | 12 | Tokens em `src/index.css` (`@theme inline`, `oklch()`); guard `no-color-literals` proíbe a volta do literal. |
| `F03` | 13 | Tema claro/escuro real — `@custom-variant dark`, `data-theme`, `prefers-color-scheme`; o seletor "Claro/Escuro/Sistema" muda a tela. |
| `F04` | 15 | TanStack Query — `queryPolicies` aplicadas, dedup por chave estrutural (`/locations` uma vez), `keepPreviousData`, polling só com aba visível (`usePageVisible`). |
| `F05` | 20 | `KpiCard`, `FilterPanel`, `OpportunityTable`, `Pagination`, `useOpportunityParams` num lugar só; guard `no-duplicate-opportunity-primitives`. As 1.561 linhas duplicadas sumiram. |
| `F06` | 19 | `src/lib/locations.ts` + `src/i18n/categories.ts` — nome vem de `/locations` (autoridade), fallback honesto pro ID; guard `no-hardcoded-location-map`. |
| `F07` | 16 | Sessão restaurada do `sessionStorage` (fonte única, `src/api/session.ts`); MSW `requireBearer` honesto. **Regressão travada na E2E (task 27)** — reverter a 16 quebra `session.spec.ts` no reload. |
| `F08` | 17 | Ordenação/paginação/contagem no servidor, com desempate total (`item`, `location`…). O cliente não re-ordena mais a página. |
| `F09` | 18 | `src/lib/money.ts` (`decimal.js`) + vetores dourados contra o motor Python; guard `no-number-money` proíbe `Number(x.profit)`. |
| `F10` | 25 | `lazy(() => import('@/…'))` de verdade em todas as rotas. Bundle 975 kB → 495 kB. |
| `F11` | 25 | `DetailDrawer` sobre `Sheet` do Radix (trap de foco, `Esc`, scroll lock); toast via `sonner` (fila, auto-dismiss); resíduos removidos. `prefers-reduced-motion` respeitado. |
| `F12` | 26 | 200 testes em 46 arquivos; cobertura travada nos módulos de lógica (`@vitest/coverage-v8`, piso 92/84/93/93); `frontend-ci.yml` roda `lint`+`typecheck`+`test`. |

### Segurança

| # | Task | Desfecho |
|---|---|---|
| `S01` | 10 | **Adiada conscientemente.** Task escrita e priorizada para antes do lançamento público; enquanto a base for pequena e conhecida, o risco é aceito. Entraram já: `api_token_id` na procedência + o rate limit de `S02`. |
| `S02` | 06 | `rate_limited_user()` — `/opportunities/*` 60/60s, `/craft/{simulate,compare}` 30/60s, por `user.id`, fail-open. |
| `S03` | 06 | **Aceito conscientemente.** JWT segue em `sessionStorage`; cookie `httpOnly`+`SameSite` adiado para o pré-lançamento. Dívida registrada. |
| `S04` | 06 | Validador de `cors_origins` — rejeita `*` e origem sem esquema fora de `development`. |
| `S05` | 06 | Teto de 10 tokens de API por usuário (409 claro). |
| `S06` | — | **Em aberto.** Abrir o catálogo sem login é decisão de produto ainda não tomada. Sem landing/SEO/"experimentar antes de criar conta" até lá. |

### Achados de fase (`W`)

Os achados vizinhos surgidos durante a fase (`W1`–`W13`) estão na tabela "Achados da fase" do
[README da Fase 3.5](tasks/refatoracao/README.md), cada um com a correção prevista. Os que
seguem abertos: `W2` (`.dockerignore` não exclui os dumps), `W3`/`W9`/`W10`/`W11` (dívidas
menores de dados e docs), e a reconciliação transacional de snapshots (`20.4`, bloqueada no
client Go — ver [task 28](tasks/refatoracao/28-retomada-dos-snapshots.md)).

## Performance — antes e depois

| Área | Antes (Fase 3) | Depois (Fase 3.5) | Task |
|---|---|---|---|
| Motor de flip | Carrega **todas** as ordens do realm pra memória da API, cruza grupos em laço aninhado (~25 M de iterações / ~5.000 combinações), ordena e pagina em Python. Sem `LIMIT`, sem filtro de expiração. | 1 consulta SQL em CTEs; 2 statements/request, constante. `EXPLAIN (ANALYZE)` ~25 ms / 6 mil candidatos. | 02 |
| Ranking Refino/Craft | `.limit(200)` **alfabético** sobre 5.633 receitas + até 8.000 `simulate_craft` **sequenciais** por request. "Melhor refino do servidor" = melhor entre os 200 primeiros do alfabeto. | Tabela materializada, rebuild em background a cada 10 min. Leitura = count + SELECT paginado + projeção barata. `EXPLAIN` ~0,6 ms / 400 linhas. Cobertura total. | 03 |
| Camada "e se" (premium, retorno, estação, foco) | Cada controle dispara um round-trip; marcar "Conta Premium" refaz até 8.000 simulações no servidor. | Recálculo no navegador sobre os componentes neutros que a linha já traz. **Zero round-trip** — verificado na E2E (nenhuma requisição ao mudar premium). | 23 |
| Dados no frontend | ~230 linhas de `useState`/`useEffect`/`AbortController`/`setInterval` à mão. `/locations` buscado 3×; polling continua em aba oculta; `setData(null)` pisca a tabela a cada tecla. | TanStack Query — dedup por chave estrutural (`/locations` 1×), `keepPreviousData`, polling só com aba visível. | 15 |
| Ordenação e paginação | Cliente re-ordena as 25 linhas recebidas; "ROI (maior → menor)" reordena a página 1 do ranking de lucro. Filtro de qualidade/encantamento **depois** da paginação → contador mente, página vem vazia havendo resultados. | Servidor ordena/pagina/conta sobre o universo, com desempate total. Cliente não reordena. | 17 |
| Bundle | `index-*.js` ≈ **975 kB**, com aviso de chunk > 500 kB. `lazy()` sem splitting real. | `index-*.js` **495 kB** + chunks por rota (`pages` 328 kB — recharts — só ao abrir Preços). Sem aviso. | 25 |
