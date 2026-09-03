# Tasks — Fase 3.5: refatoração do frontend e do motor de oportunidades

Derivada da [revisão da Fase 3](../../12-revisao-fase-3.md). É uma fase transversal: há
trabalho em repositório, backend, frontend e documentação.

**Objetivo:** tornar o produto rápido de usar e apresentável, sem jogar fora o motor de
cálculo que já está correto. A fase termina quando o scanner de oportunidades responde em
milissegundos, a interação com filtros é instantânea no cliente, e a interface está construída
sobre um design system real.

> ⚠️ A **task 01 é bloqueante e vem antes de qualquer outra coisa**. Toda a Fase 3 está fora do
> Git (`A01`). Nada mais deve ser tocado antes de haver baseline.

## Decisões que guiam a fase

Detalhadas em [12-revisao-fase-3.md](../../12-revisao-fase-3.md).

1. **Cálculo dividido por o que muda.** Servidor pré-calcula ranking e serve preço; o cliente
   recalcula o "e se" (premium, retorno, estação, impostos, lucro mínimo, ordenação) na hora,
   sem round-trip. O motor `Decimal` do Python continua sendo a fonte de verdade, protegido por
   vetores dourados verificados dos dois lados.
2. **Frontend reconstruído por cima.** React 19 + Vite + TS + Tailwind permanecem. O que entra
   é o que foi decidido e nunca instalado: shadcn/ui + Radix + lucide e tokens de design.
3. **Antifraude adiada conscientemente** (task 10) — escrita, aberta e priorizada para antes do
   lançamento público.
4. **Dinheiro é string decimal na borda**, e isso passa a ser verificado por teste.

## Ordem e dependências

```text
BLOCO 0 — salvar o trabalho
01 Baseline Git da Fase 3   ◄── bloqueia tudo

BLOCO 1 — corrigir e proteger o backend
02 Flip em SQL ────────────────┬─ 04 Contrato único de resultado
03 Ranking materializado ──────┘        └─ 05 Núcleo de cálculo único
06 Rate limit e hardening de leitura   (paralelo a 02-05)
07 Idioma único da API   ── depende de 04
08 Decisão do pub/sub    (paralelo)
09 Classificação de refino ── depende de 03
10 Antifraude de mercado ── ADIADA, pré-lançamento

BLOCO 2 — fundação visual
11 shadcn/ui de verdade
  └─ 12 Tokens de design
       └─ 13 Tema claro/escuro real
            └─ 14 Linguagem visual do produto

BLOCO 3 — fundação de dados do frontend
15 TanStack Query ─┬─ 16 Restauração de sessão
                   ├─ 17 Ordenação/filtro no servidor ── depende de 02/03
                   ├─ 18 Módulo monetário + vetores dourados ── depende de 04
                   └─ 19 Fonte única de localizações/categorias

BLOCO 4 — reconstrução das telas (depende de 11-19)
20 Componentes compartilhados
  ├─ 21 Market Flip
  ├─ 22 Refino e Craft unificados
  │     └─ 23 Camada "e se" no cliente ── depende de 18
  ├─ 24 Calculadora, Preços, Busca, Tokens
  └─ 25 Acessibilidade e code splitting

BLOCO 5 — qualidade e fechamento
26 Testes proporcionais ── 27 E2E Playwright
28 Retomada de 20.4-20.11
29 Fechamento documental ── depende de todas
```

Implementar **uma por vez** com a skill `/implementar-task`; cada spec deve ser validada contra
o estado real e receber confirmação explícita antes de alterar código.

## Lista

| # | Task | Corrige | Entrega principal |
|---|---|---|---|
| [01](01-baseline-git-da-fase-3.md) | Baseline Git da Fase 3 | `A01` | Todo o trabalho versionado e publicado |
| [02](02-motor-de-flip-em-sql.md) | Motor de flip em SQL | `B01` `B03` `B06` | Flip em milissegundos, sem ordem expirada |
| [03](03-ranking-de-producao-materializado.md) | Ranking materializado | `B02` | Ranking cobre todas as receitas, leitura instantânea |
| [04](04-contrato-unico-de-resultado.md) | Contrato único de resultado | `B04` `B05` | Bruto/líquido/taxas explícitos e iguais em toda API |
| [05](05-nucleo-de-calculo-unico.md) | Núcleo de cálculo único | `B07` `B08` | Uma fonte de verdade para taxa, frescor e cotação |
| [06](06-rate-limit-e-hardening-de-leitura.md) | Rate limit e hardening | `S02` `S03` `S04` `S05` | Endpoints caros protegidos; CORS validado |
| [07](07-idioma-unico-da-api.md) | Idioma único da API | `B09` | Contrato inteiro em inglês, com depreciação |
| [08](08-decisao-do-pubsub-de-preco.md) | Decisão do pub/sub | `B10` | Push entregue ou custo removido do caminho quente |
| [09](09-classificacao-de-refino.md) | Classificação de refino | `B11` | Refino x craft por dado, não por substring |
| [10](10-antifraude-de-mercado.md) | Antifraude de mercado | `S01` | **Adiada** — pré-requisito de lançamento público |
| [11](11-shadcn-ui-de-verdade.md) | shadcn/ui de verdade | `F01` | Biblioteca de componentes e ícones instalada |
| [12](12-tokens-de-design.md) | Tokens de design | `F02` | Zero cor literal; um sistema de estilo só |
| [13](13-tema-claro-escuro-real.md) | Tema claro/escuro real | `F03` | O seletor de tema passa a funcionar |
| [14](14-linguagem-visual-do-produto.md) | Linguagem visual | — | Densidade, hierarquia e estados definidos antes de codar tela |
| [15](15-migracao-para-tanstack-query.md) | Migração para TanStack Query | `F04` | Cache, dedup e polling correto |
| [16](16-restauracao-de-sessao.md) | Restauração de sessão | `F07` | F5 não desloga; teste deixa de mentir |
| [17](17-ordenacao-e-paginacao-no-servidor.md) | Ordenação no servidor | `F08` | Ranking e contadores param de mentir |
| [18](18-modulo-monetario-e-vetores-dourados.md) | Módulo monetário | `F09` | Decimal no cliente, verificado contra o Python |
| [19](19-fonte-unica-de-localizacoes.md) | Fonte única de localizações | `F06` | Nome de cidade vem do banco, não de 3 mapas |
| [20](20-componentes-compartilhados.md) | Componentes compartilhados | `F05` | Fim das 1.561 linhas duplicadas |
| [21](21-tela-market-flip.md) | Tela Market Flip | — | Tela principal sobre a nova fundação |
| [22](22-telas-refino-e-craft.md) | Refino e Craft unificados | — | Uma tela parametrizada no lugar de duas |
| [23](23-camada-e-se-no-cliente.md) | Camada "e se" no cliente | — | Filtros e taxas recalculando sem round-trip |
| [24](24-demais-telas.md) | Calculadora, Preços, Busca, Tokens | — | Restante do produto sobre a fundação |
| [25](25-acessibilidade-e-code-splitting.md) | Acessibilidade e splitting | `F10` `F11` | Diálogo acessível, toast com fila, lazy real |
| [26](26-testes-proporcionais.md) | Testes proporcionais | `F12` | Cobertura onde está a lógica |
| [27](27-e2e-playwright.md) | E2E Playwright | `A03` | A pasta `e2e/` que o config já espera |
| [28](28-retomada-dos-snapshots.md) | Retomada de 20.4-20.11 | — | Snapshots sobre a arquitetura nova |
| [29](29-fechamento-documental.md) | Fechamento documental | `A02` | Docs voltam a descrever a realidade |

## Status

- [x] 01 — Baseline Git da Fase 3
- [x] 02 — Motor de flip em SQL
- [x] 03 — Ranking de produção materializado
- [x] 04 — Contrato único de resultado
- [x] 05 — Núcleo de cálculo único
- [x] 06 — Rate limit e hardening de leitura
- [x] 07 — Idioma único da API
- [x] 08 — Decisão do pub/sub de preço *(Opção B — pub/sub removido)*
- [x] 09 — Classificação de refino
- [ ] 10 — Antifraude de mercado *(adiada por decisão de produto)*
- [x] 11 — shadcn/ui de verdade
- [ ] 12 — Tokens de design
- [ ] 13 — Tema claro/escuro real
- [ ] 14 — Linguagem visual do produto
- [ ] 15 — Migração para TanStack Query
- [ ] 16 — Restauração de sessão
- [ ] 17 — Ordenação e paginação no servidor
- [ ] 18 — Módulo monetário e vetores dourados
- [ ] 19 — Fonte única de localizações e categorias
- [ ] 20 — Componentes compartilhados
- [ ] 21 — Tela Market Flip
- [ ] 22 — Telas de Refino e Craft
- [ ] 23 — Camada "e se" no cliente
- [ ] 24 — Demais telas
- [ ] 25 — Acessibilidade e code splitting
- [ ] 26 — Testes proporcionais
- [ ] 27 — E2E Playwright
- [ ] 28 — Retomada dos snapshots (20.4-20.11)
- [ ] 29 — Fechamento documental

## Convenções específicas desta fase

- Nada de refatoração oportunista. Achado vizinho vira `W1`…`Wn` neste README e task própria.
- Frontend: `npm run lint && npm run typecheck && npm run test` antes de concluir cada task.
- Backend: `uv run pytest tests/ -v && uv run ruff check .` antes de concluir cada task.
- Toda task que altera OpenAPI regenera `frontend/src/api/schema.d.ts` no mesmo commit.
- Nenhum valor monetário passa por `number` no frontend. Isso é verificado por teste e por
  regra de lint, não por disciplina.
- Nenhuma cor literal em componente após a task 12. Só tokens.
- Toda task de performance (02, 03, 15, 17) registra **medição antes/depois** no mesmo dataset,
  no bloco "Estado da implementação".
- **Contrato HTTP em inglês** (task 07). Todo campo de request/response é inglês; o único
  desvio são os schemas de ingest (`*In`, espelham o wire do client Go). `sell` = ofertas
  (ask), `buy` = procuras (bid). Verificado por `backend/tests/test_api_language.py`.

## Achados da fase

| # | Achado | Corrigido em |
|---|---|---|
| `W1` | A task 2.5/01 (`R03`) deu o baseline Git por resolvido, mas a Fase 3 inteira voltou a ficar untracked. O critério de pronto era "existe commit e remote", não "a árvore está limpa". | Task 01 redefine o critério e adiciona verificação recorrente |
| `W2` | `backend/.dockerignore` não exclui `world.json` / `items.json` / `ITEM DUMP.json`. O `Dockerfile` faz `COPY . .`, então um build feito na máquina de dev embute ~60 MB de dado estático não-licenciado na imagem, que pode ir para um registry. Fora do escopo da task 01 (versionamento), registrado ao ignorá-los no Git. | Task própria: 1 linha por arquivo no `.dockerignore` |
| `W3` | `ApiTokenPublic` (`/auth/tokens` GET) ainda expõe `token_sufixo`, `nome`, `ultimo_uso_em` em português. Ficou fora da task 07 porque o schema-gêmeo `ClientIdentity` (`GET /client/me`) é parseado pelo client Go — renomear `token_sufixo` tocaria o client. Também há labels de query e docstrings em PT em `prices/service.py` (internos, não vazam pro contrato). | Task própria, coordenada com o client Go |
| `W4` | Ranking: a coluna "Retorno" de `frontend/src/opportunities/production-pages.tsx` fica sempre em `—`. O `recipe_ranking.ingredients` (JSONB) grava `expected_return_quantity: "0"` (neutro); o lucro da linha muda quando o usuário mexe no slider de retorno (projeção linear em `_project_row`), a coluna de retorno por ingrediente não. Achado na revisão do Bloco 1 (task 03). | Bloco 2 (tasks 22/24 reescrevem a tela) — ou `_project_row` recalcular o retorno por ingrediente |
| `W5` | Flip: com `buy_order=true` as colunas da tabela não fecham. `acquisition_setup_fee` conta em "Investimento" (`total_cost`) **e** em "Taxas" (`total_fees`), então `gross − total_fees − total_cost = profit − acquisition_setup_fee`. Com `buy_order=false` (default) `acq_setup=0` e fecha. Achado na revisão do Bloco 1 (task 04). | Bloco 2 (task 21) |
| `W6` | A natureza aproximada do ranking (`price_model="neutral_ranking"`, `return_rate` como aproximação linear) não é comunicada em lugar nenhum da UI. O lucro na lista do ranking ≠ o lucro em "Analisar" (`POST /craft/simulate`, exato), sem aviso ao usuário. Achado na revisão do Bloco 1 (task 03). | Bloco 2 (tasks 21–24) — badge/tooltip de "estimativa" |
| `W7` | `production-pages.tsx` oferece um controle de frescor até 168 h, mas `max_age_hours` na leitura do ranking só **aperta** a janela de 6 h do rebuild — valores acima de 6 h não têm efeito e a UI não avisa. Achado na revisão do Bloco 1 (task 03). | Bloco 2 (task 22) — limitar o controle a ≤ 6 h ou explicar |
| `W8` | `BOOK_CACHE_VERSION` (`src/cache/redis_client.py`) não foi bumpado na task 07 apesar do rename `venda→sell` / `compra→buy` nas chaves do payload de `_build_book_payload`. Payloads de cache escritos antes do deploy só **não** estouram `KeyError` em `get_item_prices` por coincidência (o check `payload.get("sources") != sources[combo]` invalida o payload velho porque a chave antiga era `fontes`). Frágil. Achado na revisão do Bloco 1 (task 07). | 1 linha: `BOOK_CACHE_VERSION = "v3"` quando a área for tocada |
| `W9` | `CLAUDE.md` e `README.md` mandam `celery ... worker -Q ingest -c 4` (pool prefork), que estoura `PermissionError [WinError 5]` no `billiard` no Windows (pool workers num loop de respawn). Produção (Linux) roda prefork ok; o dev na máquina Windows precisa de `--pool=solo` ou `--pool=threads`. Achado na revisão do Bloco 1. | Nota nos docs, ou detecção de SO no `celery_app.py` |
| `W10` | `opportunities.tasks.rebuild_recipe_ranking` varre os 3 realms a cada 10 min. East/Europe não têm dado, mas o job ainda faz `output_meta` (join de ~5,6 mil itens), `eligible` e `DELETE FROM recipe_ranking` por realm. Custo de segundos, não crítico. Achado na revisão do Bloco 1 (task 03). | `if not combos: return` cedo no `rebuild_ranking` |
| `W11` | `RELEVANT_CATEGORIES` (`scripts/_dumps.py`) só tem `["simpleitem", "equipmentitem", "weapon", "consumableitem"]`, mas `docs/02-dados-de-receita.md` lista `mount` e `furnitureitem` como categorias relevantes. Receitas de montaria/móvel **nunca são importadas** → nunca entram no ranking de craft. Pré-existente, surgido na revisão da task 09. | Task própria de dados (import de receitas) |
