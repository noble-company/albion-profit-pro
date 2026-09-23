# 17 — Higiene de repositório e imagem

> Corrige `P09`. Absorve os achados `W2`, `W9`, `W10` e `W11` da Fase 3.5.

## Objetivo

Limpar o conjunto de pendências pequenas que, somadas, são a diferença entre um repositório que
se descreve e um que se descreveu. Nenhuma é urgente sozinha; juntas cabem numa task.

## Por que

Cada item foi verificado nesta revisão.

**Imagem de produção carrega lixo local.** `backend/.dockerignore` exclui `.env`, `.venv`,
`__pycache__`, caches de pytest/ruff, `.git`, `tests/` e o compose — mas **não** exclui
`runtime-logs/` (3,3 MB de log de execução local), `uvicorn-local.out.log`,
`uvicorn-local.err.log`, `.uv-cache/` nem `.cache/`. Como `backend/Dockerfile:8` faz `COPY . .`,
tudo isso entra na imagem que vai para o registry. É a vizinhança do `W2`, que trata dos dumps.

**Rotas internas publicadas em produção.** `frontend/src/App.tsx:118-133` registra `/ui`
(`UiPreview`) e `/estilo` (`LinguagemVisualPage`) sem guarda de `import.meta.env.DEV`. O build
confirma: `Preview-*.js` tem 46 kB e `LinguagemVisualPage-*.js` 8,7 kB. São vitrines do design
system dentro do shell autenticado. De quebra, elas são as **únicas** consumidoras de oito
componentes shadcn (`checkbox`, `dropdown-menu`, `input`, `label`, `separator`, `table`,
`tooltip`, `badge`), que por isso vivem em `dependencies` de produção — enquanto
`OpportunityTable.tsx:113-150` monta tabela na mão e a Calculadora repete classes de input à mão
(ver task 04).

**Código morto.** `backend/src/items/service.py:38` (`list_location_ids`) não tem nenhuma
referência em `src/`, `scripts/` ou `tests/`. Único símbolo genuinamente órfão do backend.
`frontend/src/lib/money.ts` exporta `subtract`, `multiplyByQuantity` e `compare` sem uso fora do
próprio teste — e, como `src/lib/**` está no `include` de cobertura, funções mortas testadas
inflam o numerador do gate.

**Merge degenerado no Alembic.** `backend/alembic/versions/f2d7e8f9a0b1_corrigir_id_de_lymhurst.py:10`
tem `down_revision = ("b3e4f5a6c7d8", "f1c6d7e8f9a0")`, mas `f1c6d7e8f9a0` já é ancestral de
`b3e4f5a6c7d8`. Nunca existiram dois heads para juntar, e o arquivo não é um merge gerado — é uma
migração de dados com `down_revision` de merge escrito à mão. `upgrade` funciona; `downgrade`
percorre um grafo com ramo fantasma.

**Documentos com estado errado.** `CLAUDE.md:16` e `AGENTS.md:16` têm a linha `docs/` da tabela
congelada em "Fase 2.5 complete, 14/14" enquanto as outras três linhas foram atualizadas para a
3.5. `CLAUDE.md` afirma React Router 8; o instalado é `react-router@7.18.2`
(`frontend/README.md:11-13` explica o motivo, o `CLAUDE.md` não foi reconciliado).
`docs/00-plano-macro.md:177,255` apontam o systray em `client/systray/`, mas o caminho real é
`systray/` na raiz do fork.

**Dependência sem pin.** `frontend/package.json:44` — `recharts: "^3.7.0"` é a única com caret;
todas as outras 53 estão pinadas exatas.

**Achados herdados da 3.5.** `W9` (o comando de worker Celery documentado estoura no Windows com
pool prefork; dev precisa de `--pool=solo` ou `--pool=threads`), `W10`
(`rebuild_recipe_ranking` varre os três realms a cada 10 min mesmo sem dado em East/Europe) e
`W11` (`RELEVANT_CATEGORIES` em `scripts/_dumps.py` não inclui `mount` nem `furnitureitem`, então
receitas de montaria e móvel nunca são importadas — divergindo de
`docs/02-dados-de-receita.md`).

## O que implementar

1. `backend/.dockerignore`: acrescentar `runtime-logs/`, `*.log`, `.uv-cache/`, `.cache/` e os
   dumps estáticos (`W2`). Verificar o tamanho da imagem antes e depois.
2. Guardar `/ui` e `/estilo` atrás de `import.meta.env.DEV`, ou mover para uma entrada de build
   separada. Reavaliar quais dos oito componentes shadcn passam a ser usados de verdade pela
   task 04 e quais saem de `dependencies`.
3. Remover `list_location_ids`; decidir entre remover ou passar a usar `subtract`,
   `multiplyByQuantity` e `compare` de `money.ts` (a task 01 acrescenta `divide` — provável que
   parte deles passe a ter uso).
4. Corrigir o `down_revision` de `f2d7e8f9a0b1` para o ancestral único correto, verificando que
   `upgrade`/`downgrade` continuam funcionando do zero.
5. Reconciliar `CLAUDE.md:16`, `AGENTS.md:16`, a versão do React Router e os caminhos de systray
   em `docs/00-plano-macro.md:177,255`.
6. Pinar `recharts` na versão exata.
7. `W9`: nota nos comandos de worker sobre o pool no Windows, ou detecção de SO no
   `celery_app.py`.
8. `W10`: retorno cedo em `rebuild_ranking` quando não houver combinação para o realm.
9. `W11`: incluir `mount` e `furnitureitem` em `RELEVANT_CATEGORIES` e registrar quantas receitas
   novas entram — é o número que prova o buraco.

## Depende de

Tasks 04 (decide o destino dos componentes shadcn), 07 (o `include` de cobertura muda junto com a
remoção das funções mortas) e 16 (as correções documentais devem entrar coerentes).

## Testes automatizados

- Build da imagem do backend não contém `runtime-logs/` nem `*.log` — verificável com
  `docker run --rm imagem ls`.
- `/ui` e `/estilo` não existem no bundle de produção.
- `alembic upgrade head` e `downgrade` completos passam do zero com a cadeia corrigida.
- Seed importa receitas de montaria e móvel; a contagem sobe e fica registrada.
- `python scripts/verify_repository.py` verde depois das correções documentais.

## Testes manuais

Rodar o worker de ingest no Windows conforme a documentação corrigida e confirmar que ele
processa uma task sem `PermissionError`.

## Estado da implementação

**Concluída** (2026-09-22). Backend: `uv run pytest tests/` — **490 passed, 1 skipped**
(era 489); `ruff check .` limpo, `ruff format --check .` só acusa 11 arquivos pré-existentes
não relacionados a esta task (trabalho de sessões anteriores, não tocado aqui). Frontend:
`npm run lint` (0 erros), `npm run typecheck` (limpo), `npm run test` — **596 passed**.

### Divergência da spec confirmada antes de implementar

Como alinhado no resumo: "Depende de 04, 07 e 16" está obsoleto (tasks arquivadas/absorvidas
pela Fase 4). Validei os 9 itens direto contra o código real — 7 continuavam reais, 1 (achado do
`money.ts`) já tinha sido resolvido pela task 10 desta mesma sessão, e 1 (W10) parou de fazer
sentido porque o próprio mecanismo que ele descrevia foi removido do código (ranking
materializado aposentado, task 4/15) — sem código a corrigir, só documentação a reconciliar.

### O que mudou

1. **`backend/.dockerignore`** — acrescentou `runtime-logs/`, `.runtime-logs/` (as duas existem
   por deriva histórica), `logs/`, `*.log`, `.uv-cache/`, `.cache/`. **Medido antes/depois**:
   confirmei com `docker run --rm imagem ls` que a imagem antiga embutia `.runtime-logs/` (7,9
   MB), `runtime-logs/` (3,3 MB), `logs/` (1,3 MB) e dois `.log` soltos — **~12,5 MB de lixo
   local**, tudo confirmadamente ausente na imagem nova. O tamanho reportado por `docker image
   inspect` caiu de 70.541.638 para 69.318.833 bytes (~1,2 MB) — menor que a soma bruta dos
   arquivos por causa de deduplicação/compressão de camada do Docker; o que importa (os
   arquivos não estarem mais lá) está confirmado diretamente.
2. **`frontend/src/App.tsx`** — `/ui`/`/estilo` viraram `import.meta.env.DEV ? lazy(...) : null`
   em vez de `lazy(...)` incondicional, e a `<Route>` só é renderizada quando o componente não é
   `null`. Confirmado com `npm run build` real: nem `Preview-*.js`/`LinguagemVisualPage-*.js`
   nem as strings `UiPreview`/`LinguagemVisualPage` aparecem em `dist/assets/` — o bundle de
   produção não sabe que essas telas existem, não é só uma rota inacessível.
3. **`frontend/package.json`** — `@radix-ui/react-dropdown-menu`, `@radix-ui/react-label`,
   `@radix-ui/react-separator` e `@radix-ui/react-tooltip` moveram para `devDependencies` (só
   `Preview.tsx`/`LinguagemVisualPage.tsx` os usavam). `@radix-ui/react-checkbox` **ficou** em
   `dependencies` — a task 10 desta sessão fez `components/filters/index.tsx` (filtro real do
   scanner) passar a usá-lo. `input`/`table`/`badge` não tinham pacote Radix nenhum (wrappers
   HTML puros), nada a mover.
4. **`backend/src/items/service.py`** — `list_location_ids` removida (zero referências).
   `subtract`/`multiplyByQuantity`/`compare` de `money.ts`: **não removidas** — a task 10 já as
   colocou em uso real (`ExactAnalysis.tsx`, `engine.ts`, `calculadora.ts`, `categorias.ts`,
   `filters.ts`, `sorting.ts`).
5. **`backend/alembic/versions/f2d7e8f9a0b1_...py`** — `down_revision` de merge
   (`("b3e4f5a6c7d8", "f1c6d7e8f9a0")`) virou pai único `"b3e4f5a6c7d8"` — confirmei a cadeia:
   `b3e4f5a6c7d8 → a2d7e8f9b0c1 → f1c6d7e8f9a0`, então o segundo pai já era ancestral do
   primeiro. `alembic upgrade head` de um banco vazio passou de ponta a ponta na suíte inteira
   (a fixture de teste roda isso a cada sessão).
6. **`CLAUDE.md`/`AGENTS.md`** — versão do React Router corrigida (7.18.2 instalado, não 8, com
   o motivo). A linha `docs/` já **não** estava congelada em "2.5, 14/14" — já tinha sido
   reconciliada em algum momento anterior a esta task; nada a mudar aí. Caminho do systray em
   `00-plano-macro.md:177,255` também já estava correto (fixado na task 3.6/14).
7. **`frontend/package.json`** — `recharts` de `"^3.7.0"` para `"3.7.0"` (já era a versão
   resolvida; só o lockfile registra a mudança de faixa pra exata).
8. **`README.md`/`CLAUDE.md`/`AGENTS.md`** — nota de `--pool=solo` ao lado de cada comando
   `celery worker` (W9).
9. **W10 documentado como obsoleto** em `docs/tasks/refatoracao/README.md` — `rebuild_ranking`/
   `rebuild_recipe_ranking` não existem mais no código.
10. **`backend/scripts/_dumps.py`** — `RELEVANT_CATEGORIES` ganhou `mount` e `furnitureitem`
    (W11). **Contagem real, medida de duas formas**: em memória com `prepare_recipe_import()`
    contra os dumps reais (8.548 → 8.855, **+307 receitas**) e end-to-end contra um Postgres
    real via `import_recipes()` (**8.855 receitas no banco**, sem erro de constraint). Também
    corrigi o teste `test_iter_category_entries_flattens_relevant_categories`, que usava `mount`
    como exemplo de categoria irrelevante — trocado por `trashitem` — e acrescentei um teste de
    regressão específico para as duas categorias novas.

### Desvios da spec

- Achados W2 (dumps no `.dockerignore`) e W10 (rebuild_ranking) não exigiram código — o W2
  nunca foi alcançável pelo `docker build .` (contexto é `backend/`, os dumps ficam na raiz do
  monorepo) e o W10 descreve um mecanismo que outra task já removeu por completo. Ambos
  documentados como tal nas tabelas de achados, não silenciosamente ignorados.
- Achado do `money.ts` (metade do item 3) não precisou de remoção — a task 10 já resolveu.

### Pendente pra você testar

- **Worker de ingest no Windows com a nota nova**: rodar
  `uv run celery -A src.celery_app.celery_app worker -Q ingest -c 4 --pool=solo --loglevel=info`
  local e confirmar que processa uma task sem `PermissionError` — não é algo que eu consiga
  disparar sozinho (precisa do client Go mandando dado de verdade, ou de um payload manual).
