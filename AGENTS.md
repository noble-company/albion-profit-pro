# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## What this project is

**Albion Profit Pro** is a from-scratch platform for the game Albion Online: a crafting/refining profit calculator backed by our own market-data collection pipeline, built on top of a forked/modified version of the community `albiondata-client` (a Go client that sniffs the game's local network traffic and reports market prices).

This is a monorepo with four parts, at different stages of completion:

| Path | Status | What it is |
|---|---|---|
| `albiondata-client/` | **Fase 2 complete; Fase 2.5 client stabilized** (2026-08-23) | Authenticated fork validated with the real game. Bounded upload queues, safe retries and boot-time `/client/me` validation are implemented; releases without an explicit destination fail closed. Real Windows systray UX still needs manual validation. Market data uses `-i`; never run `gofmt -w` because upstream is CRLF. |
| `backend/` | **Fases 1, 1.5, 2.5 and the Fase 3.5 backend block complete** | FastAPI/Celery/PostgreSQL/Redis, 350 tests, live-client validation. Flip engine and production ranking rewritten in SQL (`B01`/`B02`), single quote frontier (`src/craft/quotes.py`), English-only HTTP contract, no price pub/sub. |
| `frontend/` | **Fase 3.5 complete; Fase 3.6 open** | 200 unit tests (46 files) + Playwright E2E against the real stack. Market Flip, Refino, Craft, Calculadora, Preços, Tokens on shadcn/ui + tokens + TanStack Query. The Fase 3.5 audit found live user-facing defects here — see `docs/14-revisao-fase-3-5.md` (`E01`-`E05`) before touching the "e se" layer or the filter inputs. |
| `docs/` | **Fase 2.5 complete, 14/14 tasks; Fase 3.6 open, 0/17** | Integrated Windows/game/Swarm validation (task 19) is deferred to the phase gate — and per `docs/14-revisao-fase-3-5.md` it also contains unwritten implementation, moved to task 3.6/13. Read documentation first. |

Root also has two large reference data files: `items.json` (official Albion item name/ID localization dump) and `ITEM DUMP.json` (official `items.xml` dump — crafting/refining recipes). Both are read-only reference data, not something to edit.

## Documentation system — read before doing anything else

`docs/` is the authoritative, versioned memory of this project. Before starting any non-trivial work:

1. Read `docs/README.md` for the index.
2. Read `docs/00-plano-macro.md` — the macro plan: architecture, phases, tech stack decisions, and their rationale. This supersedes any assumption you might otherwise make about stack/structure.
3. If touching the Go client or its protocol: read `docs/01-mapeamento-albiondata-client.md` first — it documents the client's internals (packet capture, Photon protocol decode, upload pipeline) and an in-progress investigation into real-time craft/refine event capture. Don't re-derive this by re-reading the Go source from scratch; it's already been mapped in detail, with file:line references.
4. If touching recipes/crafting data: read `docs/02-dados-de-receita.md` — documents the exact format of `ITEM DUMP.json` and how it joins with `items.json` (by `UniqueName` text, **not** by numeric ID — this trips people up).
5. Read `docs/05-revisao-fases-0-a-2.md` (audit of Fases 0–2), `docs/12-revisao-fase-3.md` (audit of Fase 3 + the outcome of every finding) and `docs/14-revisao-fase-3-5.md` (audit of Fase 3.5, run from real gate execution) before touching current code. The doc-14 findings are the open ones.
6. Implementation specs live in `docs/tasks/{backend,client,estabilizacao,frontend,refatoracao,correcoes}/`; each README has the dependency graph and authoritative status checklist. Fase 3.5 (`tasks/refatoracao/`) is 28/29, only task 10 (market anti-fraud) left. **Current phase is 3.6 (`tasks/correcoes/`), 0/17** — tasks 01-04 are user-facing defects and come before everything else. The task 19 in-game gate follows it. One task at a time in dependency order.

Use the `/implementar-task` skill (`.agents/skills/implementar-task/`) to implement any task from `docs/tasks/<phase>/NN-slug.md` — it enforces the required flow: validate the spec against real project state → summarize for approval → wait for explicit confirmation → implement → run automated tests for real → distinguish what you can verify yourself from what only a human can (browser/visual/in-game) → structured final report → update the status checklist.

When you make an architecture decision, discover something non-obvious about the client protocol, or change scope: update the relevant doc in `docs/` (or add a new numbered one, listed in `docs/README.md`) rather than leaving that knowledge only in conversation history.

## Working conventions established for this project

- **Plan before building anything non-trivial.** This project has consistently used Plan Mode for architecture decisions and task breakdown, with explicit user sign-off before implementation starts. Follow that pattern — don't jump straight to code for a new phase/feature without a plan the user has approved.
- **Don't reinvent the wheel.** Explicit, repeated user requirement: prefer well-established, actively maintained libraries and documented production patterns over hand-rolled solutions. Every library choice in `docs/00-plano-macro.md` and `docs/tasks/backend/` was picked after checking current (not stale-training-data) maturity/compatibility — don't casually swap one out without doing the same diligence.
- **Match the Go client's wire contract exactly.** The backend's ingest schemas must mirror the Go structs' JSON field names/casing verbatim (documented in `docs/tasks/backend/15-schemas-ingest.md` and `docs/01-mapeamento-albiondata-client.md`) — these are not up for stylistic renaming to snake_case on the wire; use Pydantic `Field(alias=...)` instead.
- **Postgres is the source of truth; Redis is a disposable cache.** Never make Redis the only place a piece of data lives. It's fine for it to be flushed at any time.
- **Communicate in Portuguese** (the user's language) in conversation and in `docs/` prose; code, identifiers, and inline comments follow normal English convention.
- **The HTTP contract is English-only** (task 3.5/07, `B09`). Every response/request field on `/items/*/prices`, `/demand`, `/craft/*`, `/opportunities/*`, `/recipes/*` uses English names; order-book sides are `sell`/`buy`. The only exception is the ingest `*In` schemas (Go wire verbatim). Enforced by `backend/tests/test_api_language.py`.
- **Money is a decimal string end to end** (task 3.5/18, `F09`). The frontend uses `src/lib/money.ts` (`decimal.js`), never `Number()` on a money field; the client "what-if" layer (3.5/23) is locked to the Python engine by golden vectors. Enforced by a `no-restricted-syntax` ESLint rule.
- **No color literals in the frontend** (task 3.5/12, `F02`). Colors are tokens in `src/index.css` (`@theme inline`, `oklch()`); icons are `lucide-react`, never glyphs. Enforced by `src/test/no-color-literals.test.ts` / `no-icon-chars.test.ts`.

## Key architecture decisions (see `docs/00-plano-macro.md` for full rationale)

| Area | Decision |
|---|---|
| Backend language/framework | Python 3.13 (**not 3.14** — Celery has no confirmed 3.14 support yet; pin via `uv`) + FastAPI |
| Task queue | Celery/RabbitMQ with durable `ingest`, `maintenance` and `quarantine` queues. Redis backend remains configured, but fire-and-forget results are ignored. |
| Auth | `fastapi-users` (SQLAlchemy adapter) — JWT backend for the web frontend, separate opaque-token (`ApiToken`) backend for the Go client. Library is in maintenance mode; auth code is isolated in `src/auth/`/`src/api_tokens/` to ease a future swap. |
| DB / ORM | PostgreSQL 16 (+ pgvector available, unused for now) via SQLAlchemy 2.0 async + `asyncpg>=0.31.0` (older asyncpg has no 3.13/3.14 wheels) + Alembic |
| Cache | Redis — "latest price" cache with short TTL. **No real-time price pub/sub** (removed in Fase 3.5/08, `B10`); the frontend polls every 30 s with cache + tab visibility. |
| Project layout | Domain-driven (`src/auth/`, `src/ingest/`, `src/prices/`, `src/recipes/`, `src/api_tokens/`, `src/cache/`, each with its own `router.py`/`schemas.py`/`models.py`/`service.py`), not grouped by file type |
| Tooling | `uv` (deps + Python version pin), `ruff` (lint/format) |
| Testing | `testcontainers-python` (real Postgres/Redis/RabbitMQ containers) + `pytest-asyncio` + `httpx.AsyncClient` — no mocking the datastore |
| Frontend | React 19 + Vite 8 + strict TypeScript + React Router 8 + Tailwind CSS 4 + shadcn/ui + TanStack Query 5; Vitest/RTL/MSW + Playwright |
| Local dev infra | Docker Compose (Postgres 16, Redis, RabbitMQ) isolated from the user's real Swarm-hosted services; production deploys onto the existing Traefik/Swarm host (deploy conventions TBD, user will share their `stack.yml` pattern) |
| Ingest transport | Client POSTs plain JSON to `{base_url}/{topic}` and sends bearer auth only to `http+token://` destinations; implemented and validated in Fase 2. |
| Market realm | Realm (`west`/`east`/`europe`) is mandatory in authenticated ingest, facts, cache and reads since Fase 2.5 task 03. Legacy facts were confirmed as West. |

## Commands

Backend and frontend are both implemented and tested.

```bash
# Backend, run from backend/
uv sync                                                    # install deps
uv run uvicorn src.main:app --reload                       # run the API locally
uv run celery -A src.celery_app.celery_app worker -Q ingest -c 4 --loglevel=info  # hot path
uv run celery -A src.celery_app.celery_app worker -Q maintenance -c 1 --loglevel=info
uv run celery -A src.celery_app.celery_app worker -Q quarantine -c 1 --loglevel=info
uv run celery -A src.celery_app.celery_app beat --loglevel=info
uv run alembic upgrade head                                 # apply DB migrations
uv run alembic revision --autogenerate -m "message"          # generate a migration
uv run pytest tests/ -v                                      # run tests (spins up testcontainers)
uv run ruff check .                                          # lint
uv run ruff format .                                          # format
docker compose up -d                                          # local Postgres/Redis/RabbitMQ (backend/docker-compose.yml)
docker build -t profitpro-backend .                           # production image (backend/Dockerfile, task 21) — same image runs API (default CMD) or worker (override command: celery -A src.celery_app.celery_app worker --loglevel=info)
```

```bash
# Frontend, run from frontend/
npm ci                                        # install deps (lockfile-exact)
npm run dev                                    # Vite dev server on :5173 (needs the API up)
npm run lint && npm run typecheck              # ESLint + tsc -b
npm run test                                   # Vitest (jsdom + MSW)
npm run test:coverage                          # + coverage gate on the logic modules
npm run test:e2e                               # Playwright vs the real stack — see frontend/e2e/README.md
npm run build                                  # tsc -b && vite build
```

```bash
# albiondata-client/ (Go, existing fork)
go build -o albiondata-client.exe .          # build (Windows; see scripts/build-*.sh for other OSes)
go test ./...                                 # run existing tests
./albiondata-client.exe -debug -d             # run locally, uploads disabled, debug logging on
```

## Phase gate

`python scripts/verify_repository.py` checks doc links/anchors, phase-status consistency across
the status docs, and that `git status --porcelain` lists no untracked source. Combined with the
`backend-ci`, `frontend-ci` and `frontend-e2e` workflows, that is the automated gate for the
phase; only the task 19 in-game validation is left for a human.

## Environment notes

- Windows dev machine. Go, Python 3.13/3.14, and Npcap (packet capture driver, required for the client to sniff traffic on Windows) are already installed on this machine — don't reinstall unless something is actually broken.
- `albiondata-client` needs Npcap (or WinPcap-compatible mode) to capture packets at all; without it, live capture silently fails to find interfaces.
