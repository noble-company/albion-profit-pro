# 01 — Baseline Git da Fase 3

> Corrige `A01`. Regressão de `R03` (task 2.5/01), registrada como `W1`.

## Objetivo

Colocar todo o trabalho da Fase 3 sob controle de versão e publicá-lo, antes de qualquer
alteração de código nesta fase.

## Por que

`git ls-files frontend` retorna **0 arquivos** e `frontend/` não está no `.gitignore`. O mesmo
vale para `backend/src/craft/`, `backend/src/opportunities/`, `backend/src/recipes/service.py`,
`backend/src/items/router.py`, `src/items/schemas.py`, `src/items/normalization.py`,
`src/static_data/constants.py`, 5 migrations, `docs/11-formulas-de-craft.md` e as specs 15-20.3.

O repositório tem 2 commits. A calculadora, o motor de oportunidades e o frontend inteiro
existem somente no disco desta máquina. Uma pasta apagada por engano apaga semanas de trabalho.

A task 2.5/01 deu esse problema por resolvido porque o critério era "existe commit e remote".
O critério estava errado: ele não detecta trabalho novo ficando de fora.

## O que implementar

1. Revisar `.gitignore`: confirmar que nada de fonte está sendo ignorado por engano e que
   artefatos que **devem** ficar de fora continuam de fora (`albiondata-client/.gocache/`,
   `backend/runtime-logs/`, `*.exe~`, caches de `uv`/`ruff`, `node_modules/`, `dist/`).
2. Adicionar ao `.gitignore` os diretórios de cache que hoje aparecem como untracked:
   `.uv-cache*/`, `.cache/`, `backend/.uv-cache/`, `albiondata-client/.gocache/`.
3. Commitar em lotes coerentes e revisáveis, **não** num commit único gigante:
   - backend: `src/craft/`, `src/opportunities/`, `src/recipes/`, `src/items/` + migrations;
   - backend: testes correspondentes;
   - frontend: aplicação completa;
   - client Go: `market_snapshot.go`, `event_update_money.go`, sondas;
   - docs: `11-formulas-de-craft.md`, specs 15-20.3, `12-revisao-fase-3.md` e esta fase.
4. Confirmar que nenhum segredo entra: `backend/.env`, `albiondata-client/config.yaml`,
   `items.json`, `ITEM DUMP.json` e `world.json` seguem ignorados. Verificar antes do push.
5. Configurar o remote e publicar.
6. Redefinir o critério de pronto do baseline: além de existir remote, `git status --porcelain`
   não pode listar arquivo de fonte não rastreado. Documentar isso no `README.md` da raiz.

## Estado da implementação

Concluída em 2026-08-31.

- `.gitignore`: além dos caches previstos (`.uv-cache*/`, `.cache/`, `backend/.uv-cache/`,
  `albiondata-client/.gocache/`), foram adicionados `backend/runtime-logs/` (tinha `.err` não
  coberto por `*.log`), `*.exe~` e `/world.json` — a spec assumia que os três já estavam de fora.
- O `origin` **já existia** (`github.com/noble-company/albion-profit-pro.git`) com `origin/main`
  publicado; o passo "configurar remote" virou apenas `git push`.
- Sete commits em lotes coerentes: `.gitignore` → backend src+migrations → backend testes →
  client Go → frontend → docs → critério de baseline no `README.md`.
- Achado vizinho registrado como `W2` no README da fase: `.dockerignore` não exclui os dumps.
- Os 39 tracked modificados da Fase 3 (integração em `main.py`, docs, client) entraram nos
  mesmos lotes; sem eles a árvore não ficava limpa.

## Depende de

Nada. **Bloqueia todas as demais tasks desta fase.**

## Testes automatizados

- `git ls-files frontend | wc -l` maior que zero.
- `git ls-files backend/src/craft backend/src/opportunities | wc -l` maior que zero.
- `git status --porcelain` não lista `.py`, `.ts`, `.tsx`, `.go` ou `.md` não rastreado.
- `git check-ignore -v backend/.env albiondata-client/config.yaml` confirma que seguem ignorados.

## Testes manuais

Clonar o repositório publicado num diretório limpo e confirmar que `backend/` e `frontend/`
sobem seguindo o `README.md`, sem depender de nenhum arquivo desta máquina.
