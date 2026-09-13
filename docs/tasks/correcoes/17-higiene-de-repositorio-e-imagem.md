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
