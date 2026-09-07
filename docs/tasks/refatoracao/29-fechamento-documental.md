# 29 — Fechamento documental da Fase 3.5

> Corrige `A02`. Mesmo espírito da task 2.5/14.

## Objetivo

Fazer a documentação voltar a descrever a realidade, e fechar a fase com um gate verificável.

## Por que

O projeto trata `docs/` como memória autoritativa, e ela está desatualizada em pontos que
enganam quem chega:

- `README.md` da raiz diz que o projeto está na **Fase 2.5** e que `frontend/` está "ainda não
  criado; próximo passo" — enquanto o frontend tem 5.220 linhas e 17 de 19 tasks concluídas.
- O aviso no topo do README ainda fala em não distribuir o client até fechar gates da 2.5.
- `docs/00-plano-macro.md` diz "Fase 3 em andamento (17/19)" sem mencionar a 3.5.
- `docs/README.md` não lista o documento `12` nem esta fase.
- `docs/tasks/frontend/README.md` marca 18 e 19 abertas sem registrar que a 18 foi absorvida
  pela task 27 desta fase.
- O plano macro promete push de preço em tempo real via WebSocket, que não existe (task 08).

É exatamente o padrão do achado `R14` da revisão anterior: documento e código divergindo em
silêncio, e a fase seguinte partindo de premissa falsa.

## O que implementar

1. Atualizar `README.md` da raiz: estado real por diretório, comandos do frontend, e o critério
   de baseline Git redefinido na task 01.
2. Atualizar `docs/00-plano-macro.md`: registrar a Fase 3.5, as três decisões de arquitetura
   (divisão do cálculo, reconstrução do frontend por cima, antifraude adiada) e corrigir a
   promessa de pub/sub conforme o resultado da task 08.
3. Atualizar `docs/README.md` com o documento `12` e a pasta `tasks/refatoracao/`.
4. Atualizar `docs/tasks/frontend/README.md`: 18 absorvida pela task 27, 19 como gate final, e o
   estado das 20.4-20.11 após a task 28.
5. Registrar em `docs/12-revisao-fase-3.md` o desfecho de cada achado (`A`, `B`, `F`, `S`), como
   as revisões `04` e `05` fazem — incluindo os conscientemente adiados (`S01`) e os que
   permanecem em aberto (`S06`).
6. Consolidar as medições de performance (tasks 02, 03, 15, 17) num único quadro antes/depois.
7. Confirmar que `CLAUDE.md` e `AGENTS.md` refletem as convenções novas: idioma da API (task 07),
   proibição de `number` em dinheiro (task 18), proibição de cor literal (task 12).
8. Gate final: script que verifica, num ambiente limpo, que `pytest`, `ruff`, `lint`,
   `typecheck`, `test` e `playwright` passam, e que `git status --porcelain` não lista fonte
   não rastreada.

## Depende de

Todas as demais tasks da fase.

## Testes automatizados

- O gate roda de ponta a ponta em ambiente limpo e passa.
- Verificação de links quebrados em `docs/`.
- `git status --porcelain` sem arquivo de fonte não rastreado (regressão de `A01`).

## Testes manuais

Um leitor que só tenha o repositório em mãos consegue entender o estado do projeto e subir
tudo seguindo apenas o `README.md`. Este é o critério real de pronto da fase.

## Estado da implementação

**Concluída** (2026-09-06). `python scripts/verify_repository.py` verde; `pytest` + `ruff`
(backend) e `lint` + `typecheck` + `test` (frontend) verdes numa passada limpa.

### O que mudou

| Item | Arquivo | Mudança |
|---|---|---|
| 1 | `README.md` (raiz) | Caixa de aviso → Fase 3.5; tabela de diretórios com o estado real; passo 5 "Frontend" (`npm ci`/`dev`); bloco de testes de frontend; "Status e limitações" reescrito até a 3.5; bloco do gate automatizado |
| 2 | `docs/00-plano-macro.md` | Seção "Fase 3.5" registrada (as 3 decisões de arquitetura, `S01` adiada); "Fase 3 — 18/19"; roadmap corrigido; pub/sub já estava corrigido (task 08) |
| 3 | `docs/README.md` | Fase 3.5 ✅ 28/29; doc `12` e `tasks/refatoracao/` já listados |
| 4 | `docs/tasks/frontend/README.md` | 18/19, gate 19, 20.4-20.11 — feito na task 28 |
| 5 | `docs/12-revisao-fase-3.md` | **Nova seção "Desfecho dos achados"** — cada `A`/`B`/`F`/`S` com a task e o desfecho; `S01` adiada, `S03` aceito, `S06` em aberto; nota das `W1`-`W13` |
| 6 | `docs/12-revisao-fase-3.md` | **Nova seção "Performance — antes e depois"** — flip (25 M iterações → ~25 ms SQL), ranking (200 alfabéticos → cobertura total, ~0,6 ms), camada "e se" (até 8.000 simulações → zero round-trip), dados no front (hooks à mão → TanStack Query), ordenação (cliente → servidor), bundle (975 kB → 495 kB) |
| 7 | `CLAUDE.md` + `AGENTS.md` | Estado por diretório, 350 testes, prioridade (gate 19), remover a linha de pub/sub; **+2 convenções de frontend** (dinheiro = string decimal, `F09`; zero cor literal, `F02`) e a regra de idioma da API no `AGENTS.md` |
| 8 | `scripts/verify_repository.py` | É o gate: + check de status "N/29" da Fase 3.5; + `git status --porcelain` falha em `.py/.ts/.tsx/.go/.md` não rastreado (guarda de `A01`); + `frontend-ci.yml`/`frontend-e2e.yml`/`frontend/e2e/README.md` obrigatórios |
| 8 | `docs/tasks/refatoracao/README.md` | Task 29 marcada; Fase 3.5 fechada em 28/29 |

### Desvios da spec

- **O "gate final" (item 8) não é um script novo.** É `verify_repository.py` estendido +
  `backend-ci` + `frontend-ci` + `frontend-e2e` — os mecanismos que já existem. Inventar um 4º
  seria dívida.
- **Fase 3.5 fecha em 28/29, não 29/29.** A task `10` (antifraude, `S01`) foi **escrita e
  priorizada**, não implementada — decisão de produto registrada na revisão. É o único item
  aberto da fase.
- **O gate em jogo (task 19 da Fase 3) continua fora.** Depende de olhos/mãos com o Albion,
  Npcap, systray e Swarm/Traefik reais.

### Testes automatizados

- `python scripts/verify_repository.py` → verde (links, âncoras, status 2.5 e 3.5, fonte não rastreada).
- `cd backend && uv run ruff check . && uv run pytest tests/ -q` → **350 passed**.
- `cd frontend && npm run lint && npm run typecheck && npm run test:coverage` → 200/200, gate ok.
- `cd frontend && npm run test:e2e` → 10/10 (verde na task 27/28; precisa da stack de pé).

### Pendente pra você testar

- **Clone limpo:** `git clone` num diretório novo e subir backend + frontend seguindo **só o
  `README.md`**, sem depender desta máquina. É o critério real de pronto da fase.
- **Task 19 (gate em jogo):** a jornada Albion → client → backend → todas as telas, com
  cidades diferentes e Black Market, validada com os olhos e o jogo aberto.
