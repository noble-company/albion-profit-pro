# Suíte E2E (Playwright) — Albion Profit Pro

> Task 3.5/27 (`A03`). Teste unitário do frontend usa MSW; **a E2E usa API, PostgreSQL,
> Redis e RabbitMQ reais** — porque o MSW já provou (`F07`) que pode mentir sobre a
> integração.

## O que a suíte cobre

| Spec | Fluxo |
|---|---|
| `smoke.spec.ts` | Registrar → logar → escolher realm → Market Flip com dado semeado |
| `session.spec.ts` | Recarregar a página autenticado e continuar logado (**regressão de `F07`**) |
| `opportunities.spec.ts` | Filtrar, paginar, ordenação estável entre páginas (`F08`); premium/retorno não dispara requisição (task 23); detalhe com os quatro cenários |
| `tokens.spec.ts` | Criar e revogar um token do client |
| `edge.spec.ts` | Sem cobertura, backend fora do ar, sessão expirando na navegação |
| `saved-crafts.spec.ts` | Criar um craft salvo, acompanhar em Meus Crafts, remover e confirmar persistência após recarregar |

## Pré-requisitos

- Docker + Docker Compose
- `uv` (backend) e Node 22 (`frontend/`)
- Egress para `raw.githubusercontent.com` na primeira execução (o seed estático baixa os
  dumps da revisão fixada no manifesto)

## Procedimento reproduzível

Tudo a partir da raiz do repositório. Cada bloco é idempotente.

```bash
# 1. Infra real, isolada da Swarm do usuário (Postgres 5433, Redis 6380, RabbitMQ 5672)
cd backend && docker compose up -d --wait

# 2. Esquema + catálogo estático (12k itens, 5,6k receitas) — reproduzível pelo manifesto
uv run alembic upgrade head
uv run python -m scripts.seed_static_data

# 3. Mercado determinístico da E2E (não sobe worker Celery — usa o caminho de escrita do ingest)
uv run python -m scripts.seed_e2e_market --realm west --reset

# 4. Cache de leitura tem TTL de ~30s; limpar evita servir uma resposta pré-seed
docker compose exec redis redis-cli FLUSHALL

# 5. API real (CORS já cobre a origem do preview em ENVIRONMENT=development)
uv run uvicorn src.main:app --host 127.0.0.1 --port 8000 &

# 6. E2E — o playwright.config.ts faz `npm run build && npm run preview` sozinho
cd ../frontend && npm run test:e2e
```

Parar tudo: `kill %1` (uvicorn) e `cd backend && docker compose down -v`.

## Notas

- **Windows:** o worker Celery em prefork estoura `WinError 5` (`W9`). Esta suíte não sobe
  worker nenhum — o seed de mercado roda síncrono por script.
- **`seed_e2e_market.py`** desloca o `Expires` dos fixtures reais 14 dias pra frente a cada
  execução, então o dado nunca vence entre rodadas. O cenário de flip
  (`T4_FIBER_LEVEL3@3`, Fort Sterling → Caerleon, ROI 32%) tem preço na ordem de grandeza
  real; só o spread é deliberado, pra dar uma oportunidade lucrativa estável.
- **CI:** `.github/workflows/frontend-e2e.yml` roda esse procedimento no `workflow_dispatch`
  e no fechamento de fase (não em todo push — subir a stack custa minutos).
