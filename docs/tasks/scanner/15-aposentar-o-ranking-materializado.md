# 15 — Aposentar o ranking materializado

## Objetivo

Apagar a varredura pré-calculada: a tabela `recipe_ranking`, o job que a reconstrói, o beat de
10 em 10 minutos, as rotas que a leem, a tela que as consumia e a camada de projeção do cliente.

## Por que

É o achado `X01`, a razão de existir da Fase 4. O rebuild só enumerava combinações
`(item, cidade, qualidade)` **que já apareciam em `market_order` para a saída da receita**
(`ranking_service.py`), então receita cuja saída nunca foi observada **não existia para o
produto** — e nenhum filtro trazia de volta. Somava-se a isso um atraso de até 10 minutos.

A Fase 4 substituiu isso por catálogo + snapshot + cálculo no cliente. Desde a task 12, `/refino`
e `/craft` apontam para o scanner e **ninguém mais lê `recipe_ranking`**.

O que sobrou é código morto que ainda cobra pedágio. Na task 18 foi preciso renomear
`station_cost_per_execution` em `ranking_service.py`, `production-pages.tsx`,
`ranking-projection.ts` e nos vetores de projeção — quatro lugares que ninguém executa, mexidos
só para o projeto compilar. Toda task daqui pra frente paga o mesmo pedágio.

## O que sai

**Backend**

| Alvo | Onde |
|---|---|
| `RecipeRanking`, `RecipeRankingRun` | `src/opportunities/models.py` (o arquivo inteiro — só tem essas duas) |
| `rebuild_ranking`, `read_recipe_ranking` | `src/opportunities/ranking_service.py` (556 linhas) |
| a task Celery do rebuild | `src/opportunities/tasks.py` |
| a entrada de beat `*/10` | `src/celery_app.py` |
| `recipe_opportunities` | `src/opportunities/service.py` |
| `_production_page`, `GET /opportunities/refining`, `GET /opportunities/crafting` | `src/opportunities/router.py` |
| `RankingComponentsOut`, `RankingCoverage` | `src/opportunities/schemas.py` — **só se `OpportunityOut`/`OpportunityPage` do flip não dependerem deles**; verificar antes |
| `tests/opportunities/test_recipe_ranking.py` | — |
| `scripts/generate_projection_vectors.py` + `tests/fixtures/golden/projection-vectors.json` | os vetores da camada de projeção |
| **migração nova** que dá `DROP` nas duas tabelas | a `d5f8a9b0c1e2` que as criou **fica** — é histórico, não se reescreve |

**Frontend**

| Alvo | Onde |
|---|---|
| a tela antiga de refino/craft | `src/opportunities/production-pages.tsx` + `.test.tsx` |
| a camada de projeção "e se" do ranking | `src/lib/ranking-projection.ts` + `.golden.test.ts` + `.applyProjection.test.ts` |
| as consultas de produção | `src/opportunities/service.ts` (só as de produção; as de flip ficam) |

## O que **fica** — e por quê

- **`flip_opportunities` e `GET /opportunities/flips`.** É SQL puro, independente do ranking, e
  serve a tela de Market Flip, que continua viva.
- **`src/opportunities/production-params.ts`.** O scanner importa `percentageToRate` dele
  (`useScannerFilters.ts`, `ScannerPage.tsx`). Se o resto do arquivo morrer junto com a tela
  antiga, a função vai para onde o scanner a usa — mas ela **não** pode sumir.
- **`useOpportunityParams.ts`**, que serve o Market Flip.
- **`WarningBadges`, `ConfidenceBadge`, `DetailDrawer`** — conferir caso a caso quem ainda
  importa; o scanner usa parte desses primitivos.

## Guards que mudam de significado

- `src/test/no-client-paging-mutation.test.ts` — proibia `.sort()`/`.filter()` na página porque a
  paginação era do servidor. Com a tela antiga apagada, o invariante restante é o do scanner: o
  cliente calcula sobre o **catálogo inteiro**. Reescrever ou remover, conforme o que sobrar.
- `src/test/code-splitting.test.ts` e `no-duplicate-opportunity-primitives.test.ts` citam a tela
  antiga no roster.
- `src/test/a11y.test.tsx` idem.

## Depende de

Task **11** e **12** — as duas telas que consumiam o ranking já migraram. Destrava a **16**.

## Testes automatizados

- A suíte inteira passa sem os arquivos apagados: nenhum import órfão, nenhum roster citando
  tela que não existe.
- `GET /opportunities/flips` continua respondendo — a exclusão não pode levar o Market Flip
  junto.
- `alembic upgrade head` seguido de `downgrade` volta ao estado anterior sem erro.
- O beat não referencia mais uma task que não existe (`celery_app` importa limpo).

## Testes manuais

Abrir Market Flip, Refino e Craft e confirmar que as três telas seguem funcionando; conferir que
o worker de `maintenance` sobe sem erro de task desconhecida.

## Estado da implementação

**Concluída.** Backend `pytest` **410 passed** (1 falha pré-existente, ver a task 18) · `ruff`
limpo · frontend `test` **386/386** · `lint` 0 erros · `typecheck` limpo.

### O que a spec não previa

**O guard de primitivos duplicados sobrevive.** Eu tinha proposto apagá-lo, achando que ele
comparava só as duas telas. Ele varre o **repositório inteiro** procurando redeclaração de
`KpiCard`/`FilterSelect`/`useOpportunityParams` etc.; só a última asserção citava
`production-pages.tsx` por nome. Apagá-lo teria sido perda real de cobertura. Ficou, com a lista
encurtada.

**Quatro órfãos que a varredura inicial não pegou:**

- `tests/opportunities/test_projection_vectors.py` — travava os vetores da camada de projeção.
  Quebrou a coleta do pytest assim que o arquivo de vetores saiu.
- `components/opportunities/RankingCoverage.tsx` e seu teste — componente que tipava
  `components['schemas']['RankingCoverage']`, schema que deixou de existir. **Ninguém o
  importava** além do próprio teste.
- `alembic/env.py` importava `src.opportunities.models` para o metadata; sem isso, todo comando
  de migração abortava com `ImportError`.
- `DetailDrawer.test.tsx` construía uma linha com `kind: 'refining'`, que deixou de ser um valor
  possível.

**O flip carregava mais coisa do ranking do que a spec listou.** Além de `RankingComponentsOut`
e `RankingCoverage`, o `OpportunityOut` tinha `ingredients`, `station_cost`, `focus_consumed` e
`price_model: "neutral_ranking"` — campos que o `flip_opportunities` **nunca preencheu**.
Confirmei que o `DetailDrawer`, que parecia lê-los, na verdade renderiza um `CraftResult` do
`/craft/simulate`. Saíram junto; `OpportunityIngredientOut` ficou sem uso e saiu também.

### A cobertura que encolheu de verdade

Dois testes comparavam superfícies entre si, e uma das superfícies deixou de existir:

- `test_result_contract.py` comparava `/flips`, `/refining` e `/crafting` — a prova de que três
  motores concordavam sobre o que é "lucro". Sobrou um.
- `test_sales_tax_rate_is_single_source_across_surfaces` comparava três superfícies; sobraram
  duas (flip e simulate).

O substituto do refino é o scanner, que calcula no cliente — não há endpoint para perguntar. A
concordância dele com o servidor é travada por **outro mecanismo**: os vetores dourados. Está
escrito no topo dos dois arquivos, para ninguém ler o teste encolhido achando que ele ainda
prova o que provava.

### `percentageToRate` mudou de casa

Era o único símbolo de `opportunities/production-params.ts` que o scanner usava (4 arquivos).
Foi para `lib/money.ts`, que é onde mora a divisão decimal — o scanner importar de
`opportunities/` era resquício. O teste foi junto, como `lib/percentage-to-rate.test.ts`.

### Migração

`d6b7c8e9f0a1` derruba as duas tabelas; a `d5f8a9b0c1e2` que as criou **fica**, como histórico.
Verificado o ciclo completo no banco de desenvolvimento: `upgrade` → 0 tabelas, `downgrade` → 2
tabelas, `upgrade` → 0.

### Testes manuais que já rodei

- **Worker de `maintenance` sobe sem task desconhecida.** Reiniciei os quatro processos Celery e
  a API (rodavam com o código antigo). O worker registra 9 tasks, nenhuma de ranking; nenhum
  log tem `unknown task`, `ImportError` ou traceback.
- **O beat perdeu a entrada.** Restam `rollup-diario`, `poda`, `sync-aodp` e `metricas-das-filas`.
- **As rotas.** `/opportunities/flips` responde 401 (existe, exige auth); `/refining` e
  `/crafting` respondem **404**.

### Pendente pra você testar

1. Abrir **Market Flip** e confirmar que a lista carrega — é a tela que compartilhava schema com
   o ranking e teve quatro campos removidos da resposta.
2. Abrir **Refino** e **Craft** e confirmar que seguem iguais.
3. Abrir a **Calculadora** — ela usa `WarningBadges`/`DetailDrawer`, primitivos que o ranking
   também usava.
