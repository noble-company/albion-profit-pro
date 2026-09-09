# Revisão da Fase 3.5 — verificação executada, defeitos de usuário e gates que mentem

Auditoria feita em 2026-09-06, logo após o fechamento documental da Fase 3.5
([tasks/refatoracao/29](tasks/refatoracao/29-fechamento-documental.md)). O gatilho foi a
pergunta "está tudo aplicado e dá pra ir pra Fase 4?".

Diferente das revisões anteriores, esta partiu de **execução real dos gates**, não de leitura de
código: as suítes foram rodadas, o build foi feito, a aritmética suspeita foi reproduzida em
Node, e cada achado grave foi confirmado à mão antes de entrar aqui.

## Verificações executadas

| Gate | Resultado |
|---|---|
| `python scripts/verify_repository.py` | verde, exit 0 |
| `git status --porcelain` / `origin/main` | limpo, 0 ahead / 0 behind |
| `backend`: `ruff check .` + `ruff format --check .` | limpo, 195 arquivos |
| `backend`: `uv run pytest tests/` | **350 passed** em 50,6 s, testcontainers reais |
| `frontend`: `npm run lint` | 0 erros, 4 warnings `react-refresh/only-export-components` |
| `frontend`: `npm run typecheck` | limpo |
| `frontend`: `npm run test` | **46 arquivos / 200 testes**, todos verdes |
| `frontend`: `npm run build` | `index` **494,80 kB** + chunk `pages` 328 kB |
| `albiondata-client`: `go test ./...` | verde |
| `albiondata-client`: `scripts/validate-fmt.sh` | **falha** (`E06`) |

Os números declarados nos documentos batem no dígito: 350 testes de backend, 200 testes em 46
arquivos no frontend, bundle de 495 kB. **A Fase 3.5 foi entregue de verdade.** O que segue são
os defeitos que sobreviveram a ela.

## O que a auditoria confirma como bem feito

- `B10` está realmente extirpado: `publish_price_update` não existe mais, e
  `tests/ingest/test_tasks.py:84-120` trava a regressão fazendo monkeypatch de `Redis.publish` e
  afirmando que nada foi publicado.
- Zero SQL injection: nenhuma interpolação em `text()`; `sort`/`direction` são `Literal` no
  router e só indexam um dicionário de colunas (`src/opportunities/sorting.py:13`); a busca usa
  `contains(..., autoescape=True)`.
- Divisão por zero guardada em todos os pontos de cálculo (`func.nullif`, `if filled else None`,
  `if base_cost > 0 else None`).
- Zero `float(` e zero `round()` sobre dinheiro no backend; todas as colunas monetárias são
  `Numeric`.
- Zero literal de cor no frontend — confirmado por grep independente sobre hex, `rgb()`, `hsl()`
  e as 22 paletas do Tailwind, não apenas pelo guard.
- Zero `TODO`/`FIXME`/`HACK`, zero `any`/`as any`, zero `@ts-ignore`, zero `console.*` em código
  de produção.
- Cadeia Alembic com head único.
- Contagem de testes coerente com o declarado, sem `.skip`/`.only`.

## Achados — defeitos (`E`)

| # | Severidade | Achado | Impacto |
|---|---|---|---|
| `E01` | Crítica | `frontend/src/opportunities/production-pages.tsx:63-67` — `percentageToRate` faz `Number(v.replace(',','.')) / 100`. Reproduzido em Node: `36.7` vira `0.36700000000000005`, `8.8` vira `0.08800000000000001`, `2.9` vira `0.028999999999999998`. | O valor alimenta `ranking-projection.ts:74,77` e daí `totalCost`/`profit`/`roi`. O Python calcularia `Decimal('36.7')/100 == Decimal('0.367')`. **Cliente e servidor divergem** — exatamente o que `F09` e os vetores dourados existem pra impedir. Os vetores não pegam porque recebem `return_rate` já como string. |
| `E02` | Crítica | `components/opportunities/FilterPanel.tsx:137-160` — `FilterNumber` é um `input` de texto livre (`inputMode="decimal"`), sem sanitização, ligado direto ao param da URL. `production-pages.tsx:72` passa o valor cru de "Estação por execução" e `ranking-projection.ts:76` faz `money(...)`. Reproduzido: `new Decimal('1,5')` lança `[DecimalError] Invalid argument`. | O separador decimal do próprio locale que o app usa pra formatar (`money.ts:114,138,142`) derruba a tela de Refino/Craft. |
| `E03` | Crítica | Retorno acima de 100% produz `returnFactor` negativo (`ranking-projection.ts:77`), custo de ingrediente negativo (`:99`) e `percentageCharge` lança `RangeError` (`money.ts:65`) no ramo `buy_order`. Não há `min`/`max` no input. | Segundo caminho de queda da mesma tela. |
| `E04` | Crítica | **Não existe `ErrorBoundary` no projeto.** Grep por `ErrorBoundary`, `componentDidCatch` e `getDerivedStateFromError` em `src/` e `e2e/`: zero ocorrências. `App.tsx:44-52` (`Boundary`) é só `Suspense`. | `E02` e `E03` lançam **durante o render** do `useMemo` de `production-pages.tsx:137-143`, então o resultado é **tela branca**, não `EstadoErro`. O mesmo buraco transforma falha de carregamento de chunk lazy (deploy novo, hash velho em cache) em tela branca. |
| `E05` | Alta | `src/craft/pages.tsx:148` desestrutura `formState: { errors }` e usa **uma única vez** (`:209`, para `output_item`). As regras `required: 'Selecione a cidade'` (`:231`) e `min: {value:1, message:'Mínimo 1'}` (`:225`) bloqueiam o submit e não renderizam nada. | Na Calculadora — a proposta central do produto — o usuário aperta o botão e a tela não reage, sem mensagem. Sem `aria-invalid`, sem `aria-describedby`. |
| `E06` | Alta | `albiondata-client/scripts/validate-fmt.sh` falha em `lib/market.go:86-102` e `client/market_snapshot.go:56` (alinhamento de `gofmt`, já descontado o CRLF pelo próprio script). Entraram no commit `0f56178` (2026-08-31), **posterior** ao `8535b29` que criou `client-ci.yml`. | O step "Validate formatting" do `client-ci` deve estar vermelho desde 31/08. `README.md:179-181` dá o gate automatizado como verde. |
| `E07` | Alta | `B09` não está completo. `src/items/router.py:17-18` recebe os query params `categoria` e `apenas_craftaveis` (o serviço interno já usa `category=`/`craftable_only=` em `:30-31`); `src/craft/constants.py:29-33` emite `dado_velho`, `profundidade_insuficiente`, `sem_preco`, `sem_cobertura` e `ordem_nao_garantida`; `src/prices/schemas.py:37,64` tem `coverage: Literal["parcial"]`; `compare_service.py:292-311` tem `unavailable_reason` em PT; todo `HTTPException.detail` é PT. | O `CLAUDE.md:42` afirma inglês em toda rota com **uma** exceção. São duas documentadas (`ApiTokenPublic`/`ClientIdentity`, registradas em `test_api_language.py:3-6`) e várias não documentadas. Os nomes PT vazam até `frontend/src/api/schema.d.ts:2316-2317`. |
| `E08` | Alta | `ix_item_busca_normalizada_trgm` (GIN + `gin_trgm_ops`) existe só na migração `f1c6d7e8f9a0:58-63`. `src/items/models.py` é o único módulo de modelos **sem `__table_args__`**, e `busca_normalizada:30` não declara índice. | Como `alembic/env.py` usa `Base.metadata` como `target_metadata`, o próximo `--autogenerate` emite `op.drop_index(...)`. Se passar batido, a busca de itens (`items/service.py:71`, `opportunities/service.py:26`, `ranking_service.py:442`) cai para seq scan. |
| `E09` | Alta | Documentos autoritativos ainda descrevem comportamento revogado pela própria 3.5: `03-contrato-ingest-real.md:434-437` descreve o contrato em português (`melhor_preco`, `observado_em`, `cobertura`) e `README.md:10` declara que esse doc "tem precedência"; `tasks/frontend/15-motor-oportunidades.md:31-33` ainda afirma que "o ranking limita candidatos a 200 receitas por chamada" (o próprio `B02`); `tasks/backend/14-modulo-redis.md` manda implementar `publish_price_update`; `tasks/backend/17-tasks-celery-gravacao.md:33,82` mostra código chamando função apagada. | Quem implementar a task 19 lendo essas specs reconstrói o defeito. É o padrão `A02`/`R14` de novo. |
| `E10` | Média | Os guards de frontend cobrem menos do que aparentam. `vite.config.ts:23-29` mede ~25 de 85 arquivos-fonte, deixando de fora `production-pages.tsx` (**o arquivo de `E01`**), `api/query.ts`, `design/confidence.ts` e `auth/forms.ts`. `projection-vectors.json` tem 8 vetores, 7 deles com o mesmo `components`, sem cobertura de `expected: null`, `roi: null` nem `applyProjection`, e sem mecanismo que detecte fixture desatualizado. `src/test/a11y.test.tsx:23-91` audita as 6 telas com **payload vazio** e **fora do `AppShell`**, reprovando só `serious`/`critical`. `no-icon-chars.test.ts:7-9` é lista negra de 8 glifos. | O gate de cobertura de `F09` não cobre o arquivo onde `F09` está quebrado. |
| `E11` | Média | `useFlipOpportunities` (`opportunities/hooks.ts:44`), `useProductionOpportunities` (`:65`) e `useItemPrices` (`prices/hooks.ts`) devolvem `{data, loading, error}` e **não expõem `refetch`**. `useCategories` (`:25`), `useLocations` e `useItem` (`prices/hooks.ts:16,29`) engolem o erro com `return data ?? []`. `src/items/pages.tsx` não tem loading, erro, retry nem empty state. `src/api/errors.ts:25-27` marca requisição abortada como `retryable: true`. | Três das seis telas não conseguem oferecer retry — a única saída do usuário é F5. O guard `no-inert-onretry.test.ts` proíbe corretamente o botão falso, mas o desenho dos hooks torna o botão verdadeiro impossível. Falha em `/items/categories` renderiza filtro vazio sem aviso. Cada tecla no autocomplete que cancela a busca anterior tende a virar retry duplo. |

## Achados — pontos de atenção (`P`)

| # | Achado | Consequência |
|---|---|---|
| `P01` | Não existe caminho de deploy do frontend. `backend/stack.production.example.yml` só tem `migrate`, `seed`, `api`, três workers e `beat`; **não há `Dockerfile` em `frontend/`**, nem serviço servindo a SPA, nem label de Traefik pro front. | A spec da task 19 (`tasks/frontend/19-build-validacao.md:7-9`) pede build multi-stage do frontend, serving com fallback HTML e mesma origem em produção. `CLAUDE.md:29` e `README.md:165-167` descrevem a 19 como se fosse só ensaio humano. **Ela contém implementação.** |
| `P02` | A premissa da Fase 4 nunca foi construída. `00-plano-macro.md:249` define a fase como trocar o "abrir navegador" da Fase 2 por um webview; esse item de menu não existe — `albiondata-client/systray/systray_win.go:70-78` tem Build info, Connection, Reload Configuration, Show/Hide Console e Quit. Além disso `00-plano-macro.md:177,255` apontam o systray como `client/systray/`, mas o caminho real é `systray/` na raiz do fork. | Não há o que substituir. A Fase 4 começa por construir o que a Fase 2 deixou pra trás. |
| `P03` | `20.4` está no limbo. `tasks/refatoracao/28-retomada-dos-snapshots.md:67` a registra como bloqueada no client Go, e o código confirma: `client/market_snapshot.go:16-33` deriva `Scope` **a partir das ordens observadas**, então um book que ficou vazio não gera escopo nenhum. | Ordem cancelada ou consumida antes de vencer segue cotável em Market Flip, Refino, Craft e Calculadora até expirar. É o `B03` pela outra ponta, e é o que mais afeta a confiança no número da tela. Documentado como aberto, sem decisão de quando. |
| `P04` | O ranking filtra (`ranking_service.py:423-426`) e ordena (`:460-473`) por `neutral_profit`/`neutral_roi`, mas devolve `profit`/`roi` projetados com os parâmetros do usuário (`:485-520`). | **É decisão documentada** (`tasks/refatoracao/23-camada-e-se-no-cliente.md:122-128`, com `price_model="neutral_ranking"` e aviso de `RankingCoverage` na tela). O resíduo é que `min_profit` pode devolver linhas exibindo lucro bem menor e `sort=profit` não ordena pela coluna exibida. Item de validação em jogo, não correção de código. |
| `P05` | `frontend/e2e/` tem 5 specs e 10 casos: `smoke` (Market Flip), `session`, `opportunities`, `tokens` e `edge`. Não há spec de Refino, Craft, Calculadora, Preços nem Demanda — e a calculadora de craft é a proposta central. O workflow ainda semeia `--rebuild-ranking` pras telas que nenhum teste abre. Somado: `frontend-e2e.yml:6-11` roda só em `workflow_dispatch` e tag `fase-*`, então a suíte não bloqueia merge. | `F07` foi exatamente um bug que o MSW escondeu e a E2E travou. A classe pode repetir nas telas sem cobertura. |
| `P06` | "Fronteira única de cotação" vale só para craft/refino. `src/craft/quotes.py` é importado só por `craft/service.py` e `craft/compare_service.py`, e o ranking passa por `simulate_craft` — mas existem **três** motores lendo `MarketOrder`: `quotes.py` (profundidade e warnings), `opportunities/service.py:88-178` (flip, top-of-book em SQL) e `prices/service.py:293-344`. | A divergência é deliberada (`price_model="top_of_book"`), mas a afirmação nos documentos é mais forte que o código. Precisa de documentação, não de refatoração. |
| `P07` | `recipe_silver_cost` é `int` em `opportunities/schemas.py:26` e `recipes/schemas.py:29`, e `Decimal` em `craft/schemas.py:100,167`. Atravessa até o frontend: `schema.d.ts:730,779` dizem `string` e `:1370` diz `number`; as fixtures discordam entre si (`production-pages.test.tsx:129` usa `'0'`, `:340` usa `12`). | Em `ranking-projection.ts:75` o valor entra em `money()`, que aceita `number` (`money.ts:31`). É exato para inteiro, então não há bug vivo — mas é a rachadura na regra "dinheiro é string decimal ponta a ponta". |
| `P08` | `scripts/verify_repository.py:136-141` só falha em linhas `??` cujo sufixo esteja em `SOURCE_SUFFIXES` (`.py`, `.ts`, `.tsx`, `.go`, `.md`). Não pega arquivo modificado, staged, deletado, nem commit não pushado; e como respeita o `.gitignore`, basta ignorar `frontend/` pro check ficar verde. Faltam `.css` (onde vivem os tokens da `F02`) e `.yml` (os próprios workflows). Em CI é no-op — o checkout é sempre limpo. | O `A01` original era "fora do Git **sem estar no `.gitignore`**", justamente a variante que o guard não vê. `verify_phase_status` também só cobre as Fases 2.5 e 3.5. |
| `P09` | Higiene, tudo verificado: `backend/.dockerignore` não exclui `runtime-logs/` (3,3 MB), `uvicorn-local.*.log`, `.uv-cache/` nem `.cache/`, e `Dockerfile:8` faz `COPY . .`; `frontend/src/App.tsx:118-133` publica `/ui` (46 kB) e `/estilo` no build de produção, com oito componentes shadcn existindo só pra elas; `src/items/service.py:38` (`list_location_ids`) é código morto; `alembic/versions/f2d7e8f9a0b1:10` tem `down_revision` de merge apontando pra um nó **e** pro ancestral dele; `12-revisao-fase-3.md:206` fala de `W1`–`W13` mas a tabela só tem `W1`–`W12`; `W8` (`BOOK_CACHE_VERSION`, ainda `"v2"`) segue aberto e fora da lista de abertos; `CLAUDE.md:16` e `AGENTS.md:16` têm a linha `docs/` congelada na 2.5; `CLAUDE.md` diz React Router 8 e o instalado é `7.18.2`; `recharts` é a única dependência com caret; o `client-ci` roda `go vet` só no Linux, então os `_win.go` — a plataforma real do client — nunca são analisados. | Nenhum é urgente isoladamente; somados são a diferença entre um repositório que se descreve e um que se descreveu. |

## Decisões desta revisão

### 1. Os defeitos de usuário vêm antes de qualquer coisa

`E01`–`E05` são o que uma pessoa usando o produto encontra: um número errado e duas telas
brancas. Nenhum contrato, documento ou gate passa na frente disso.

### 2. `P04` e `P06` não viram correção de código

`P04` é uma decisão de arquitetura já tomada e documentada; o que falta é confirmar em jogo que
a UI comunica bem a diferença — item do gate da task 19, não task própria. `P06` precisa que o
documento pare de prometer mais do que o código entrega; a solução é escrever a verdade, não
unificar três motores que são deliberadamente diferentes.

### 3. A task 19 é implementação, não só ensaio

`P01` mostra que "gate final" virou nome de uma coisa que ainda tem código pra escrever. A
implementação do serving e do deploy do frontend sai da 19 e vira task própria desta fase, do
mesmo jeito que a 3.5/27 substituiu a task 18 da Fase 3. A 19 fica sendo o que o nome diz: o
ensaio integrado em jogo.

### 4. A Fase 4 não começa aqui

Além de `P01` e `P02`, a ordem do próprio plano macro (`00-plano-macro.md:279-283`) põe a task
19 e o deploy antes da Fase 4. E `P03` — ordem que sumiu do mercado e continua sendo cotada —
vale mais para o produto do que trocar o navegador por um webview.

## Fora do escopo desta fase

Continuam adiadas por decisão já registrada em
[12-revisao-fase-3.md](12-revisao-fase-3.md#desfecho-dos-achados-2026-09-06): `S01` (antifraude
de mercado, task 3.5/10), `S03` (JWT em cookie `httpOnly`) e `S06` (catálogo sem login). Os
achados `W2`, `W9`, `W10` e `W11` da Fase 3.5 entram na task de higiene desta fase; `W3` é
absorvido pela task de contrato.

## Execução

Ordem, dependências e status em [tasks/correcoes/](tasks/correcoes/README.md).
