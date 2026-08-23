# Tasks — Backend

> As Fases 1/1.5 permanecem historicamente concluídas, mas a auditoria posterior encontrou
> bloqueadores transversais. O próximo trabalho está na
> [Fase 2.5](../estabilizacao/README.md), não em reabrir este checklist nem iniciar o frontend.

Microetapas detalhadas do backend, derivadas do [plano macro](../../00-plano-macro.md). Cada
arquivo é uma unidade de trabalho independente (spec completa: objetivo, por quê, o que
implementar, dependências, testes manuais e automatizados).

Há duas levas:

- **Fase 1 (01-22)** — construção inicial. ✅ Completa.
- **Fase 1.5 (23-36)** — correções e remodelagem, derivadas da
  [revisão da Fase 1](../../04-revisao-fase-1.md) e da
  [captura do contrato real](../../03-contrato-ingest-real.md). ✅ Completa.

---

# Fase 1 — construção inicial ✅

## Ordem de implementação (histórico)

```
01 Ambiente/tooling
  └─ 02 Estrutura de pastas
       ├─ 03 Configuração ──────────────┬─ 04 Docker Compose (paralelo, sem dependência)
       │                                 │
       └─ 05 Conexão com banco ──────────┘
            └─ 06 Alembic
                 ├─ 07 User + fastapi-users
                 │    └─ 08 ApiToken (auth do client Go)
                 │         └─ 09 Router de auth
                 ├─ 10 Modelo MarketOrder
                 ├─ 11 Modelo MarketHistory
                 └─ 12 Modelo Recipe/RecipeIngredient

13 Setup Celery (depende de 03, 04)
14 Módulo Redis (depende de 03, 04)
15 Schemas de ingest (depende de 02, paralelo ao resto)

16 Router de ingest (depende de 08, 13, 15)
     └─ 17 Tasks Celery de gravação (depende de 10, 11, 13, 14)

18 Router de leitura de preços (depende de 10, 14)
19 Script de import de receitas (depende de 12, 05)

20 Testes automatizados — setup (depende de 01, 06, 09)
21 Dockerfile de produção (depende de tudo de 07 em diante — fechamento)
22 Observabilidade (depende de 05, 14)
```

## Lista

| # | Task | Entrega |
|---|---|---|
| [01](01-ambiente-tooling.md) | Ambiente e tooling | `uv`, Python 3.13 pinado, `ruff`, pre-commit |
| [02](02-estrutura-pastas.md) | Estrutura de pastas | Esqueleto domain-driven |
| [03](03-configuracao.md) | Configuração | `Settings` via pydantic-settings, `.env.example` |
| [04](04-docker-compose-dev.md) | Docker Compose de dev | Postgres 16 + Redis + RabbitMQ locais |
| [05](05-conexao-banco-dados.md) | Conexão com banco | Engine/sessão async SQLAlchemy |
| [06](06-alembic-setup.md) | Alembic | Harness de migrations async |
| [07](07-modelo-user-fastapi-users.md) | Modelo User + fastapi-users | Auth JWT web |
| [08](08-api-token-client-go.md) | ApiToken | Auth do client Go (token opaco) |
| [09](09-router-auth.md) | Router de auth | `/auth/register`, `/auth/login`, `/auth/tokens` |
| [10](10-modelo-market-order.md) | Modelo MarketOrder | Tabela de ordens de mercado |
| [11](11-modelo-market-history.md) | Modelo MarketHistory | Tabela de histórico de preços |
| [12](12-modelo-recipe.md) | Modelo Recipe/RecipeIngredient | Tabelas de receita (Fase 1b) |
| [13](13-setup-celery.md) | Setup do Celery | App Celery + broker RabbitMQ |
| [14](14-modulo-redis.md) | Módulo Redis | Cache + pub/sub |
| [15](15-schemas-ingest.md) | Schemas de ingest | Pydantic 1:1 com os structs Go |
| [16](16-router-ingest.md) | Router de ingest | `POST /*.ingest` |
| [17](17-tasks-celery-gravacao.md) | Tasks Celery de gravação | ⚠️ **revisada** — ver tasks 23, 26, 27 |
| [18](18-router-precos.md) | Router de leitura de preços | ⚠️ **revisada** — ver tasks 28, 29, 30 |
| [19](19-script-import-recipes.md) | Script de import de receitas | Popula `Recipe` a partir do `ITEM DUMP.json` |
| [20](20-testes-automatizados.md) | Testes automatizados (setup) | Fixtures testcontainers |
| [21](21-dockerfile-producao.md) | Dockerfile de produção | ⚠️ **revisada** — ver task 34 |
| [22](22-observabilidade.md) | Observabilidade | ⚠️ **parcial** — logging nunca usado, ver task 24 |

## Status — Fase 1

- [x] 01 — Ambiente e tooling
- [x] 02 — Estrutura de pastas
- [x] 03 — Configuração
- [x] 04 — Docker Compose de desenvolvimento local
- [x] 05 — Conexão com banco de dados
- [x] 06 — Alembic
- [x] 07 — Modelo User + fastapi-users
- [x] 08 — ApiToken (auth do client Go)
- [x] 09 — Router de auth
- [x] 10 — Modelo MarketOrder
- [x] 11 — Modelo MarketHistory
- [x] 12 — Modelo Recipe/RecipeIngredient
- [x] 13 — Setup do Celery
- [x] 14 — Módulo Redis
- [x] 15 — Schemas Pydantic de ingest
- [x] 16 — Router de ingest
- [x] 17 — Tasks Celery de gravação
- [x] 18 — Router de leitura de preços
- [x] 19 — Script de import de receitas
- [x] 20 — Testes automatizados (setup)
- [x] 21 — Dockerfile de produção
- [x] 22 — Observabilidade

---

# Fase 1.5 — correções e remodelagem ✅

Origem de cada task: [04-revisao-fase-1.md](../../04-revisao-fase-1.md) (achados `C`/`A`/`M`/`P`)
e [03-contrato-ingest-real.md](../../03-contrato-ingest-real.md) (achados `N`, medidos no jogo).

> **Contexto que justifica esta fase:** o caminho de escrita do ingest nunca rodou de verdade
> (os testes chamam as corotinas internas, nunca o wrapper Celery), e toda a Fase 1 foi
> construída contra payloads inventados. Quando o jogo real foi capturado, apareceram três
> problemas semânticos que nenhuma revisão de código pegaria.

## Ordem de implementação

```
ETAPA 1 — destravar o caminho de escrita (bloqueia a Fase 2)
23 Ciclo de vida async no worker  ← CRITICO, nada roda em producao sem isso
  └─ 24 Retry + logging + gold price explicito

ETAPA 2 — corrigir a semantica dos dados (bloqueia a calculadora)
25 Normalizacao de escala e tempo (depende de 23)
  ├─ 26 Remodelar market_history_entry
  ├─ 27 Remodelar market_order
  └─ 28 Tabela item + localizacao (depende de 25, 26, 27)
       └─ 29 Precos por lado e profundidade
            └─ 30 Cobertura por usuario e escopo
                 └─ 31 Retencao, rollup mensal e endpoint de demanda

ETAPA 3 — seguranca e deploy (paralelo a etapa 2)
32 Hash de API tokens (depende de 25)
33 Hardening HTTP (depende de 24)
34 Migrations em producao + Dockerfile

ETAPA 4 — consistencia
35 Import de receitas idempotente (depende de 24, 28)
36 Limpeza estrutural + refactor de testes (por ultimo, MAS as fixtures
   de payload real devem ser criadas antes das tasks 25-29)
```

## Lista

| # | Task | Corrige | Entrega |
|---|---|---|---|
| [23](23-ciclo-de-vida-async-worker.md) | Ciclo de vida async no worker | `C1` | Worker sobrevive a mais de uma task |
| [24](24-retry-e-logging-no-ingest.md) | Retry, logging e gold price | `A5` `P3` `C6` | Ingest para de perder dado em silêncio |
| [25](25-normalizacao-escala-e-tempo.md) | Normalização de escala e tempo | `N1` `N4` `M2` `M3` | Prata ÷10⁴, tick → `TIMESTAMPTZ` |
| [26](26-remodelar-market-history.md) | Remodelar `market_history_entry` | `N2` `M7` | Bucket global, idempotente, auto-corretivo |
| [27](27-remodelar-market-order.md) | Remodelar `market_order` | `C2` | Estado atual do livro, dedup por `Id` |
| [28](28-tabela-item-e-localizacao.md) | Tabela `item` e localização | `N3` `M6` | Ponte `Index ↔ UniqueName`, locais dinâmicos |
| [29](29-precos-por-lado-e-profundidade.md) | Preços por lado e profundidade | `C3` `C4` `C5` `M1` | Compra/venda separados, 2 queries em vez de 80 |
| [30](30-cobertura-por-usuario-e-escopo.md) | Cobertura por usuário e escopo | `M5` `C5` | `market_scan`, dados globais, `scope=mine` correto |
| [31](31-retencao-e-rollup-mensal.md) | Retenção, rollup e demanda | — | 30 dias + série mensal + `GET /items/{id}/demand` |
| [32](32-hash-de-api-tokens.md) | Hash dos tokens de API | `A1` | `sha256` no banco, sem invalidar token em uso |
| [33](33-hardening-http.md) | Hardening HTTP | `A2` `A3` `A6` `P8` | CORS, `/ready`, limites, rate limit, senha |
| [34](34-migrations-em-producao-e-dockerfile.md) | Migrations em produção + Dockerfile | `A4` `P7` | Imagem migra, roda como não-root — validada por `backend/scripts/check_image.sh`, não pela suíte pytest (build de imagem Docker não entra no `pytest`) |
| [35](35-import-de-receitas-idempotente.md) | Import de receitas idempotente | `M4` `P9` | Reimportar deixa de exigir passo manual |
| [36](36-limpeza-e-refactor-de-testes.md) | Limpeza e refactor de testes | `P1` `P2` `P4` `P5` `P6` | Fixtures compartilhadas e payload real |

## Status — Fase 1.5

Marcado por quem implementa (ou pela skill `/implementar-task`) assim que uma task é concluída e
seus testes passam. Fonte de verdade pra saber o que já está pronto antes de começar a próxima.

- [x] 23 — Ciclo de vida async no worker Celery
- [x] 24 — Retry, logging estruturado e gold price explícito
- [x] 25 — Normalização de escala e tempo na borda do ingest
- [x] 26 — Remodelar `market_history_entry`
- [x] 27 — Remodelar `market_order`
- [x] 28 — Tabela `item` e normalização de localização
- [x] 29 — Preços por lado do livro e profundidade
- [x] 30 — Cobertura por usuário e `scope=all|mine`
- [x] 31 — Retenção, rollup mensal e endpoint de demanda
- [x] 32 — Hash dos tokens de API
- [x] 33 — Hardening da camada HTTP
- [x] 34 — Migrations em produção e Dockerfile
- [x] 35 — Import de receitas idempotente
- [x] 36 — Limpeza estrutural e refactor da suíte de testes

## Pendência aberta antes de começar

~~A task 23 depende de uma **confirmação empírica** que ainda não foi feita~~ — **confirmada em
2026-08-22**, antes de aplicar a correção: rodando `tests/ingest/test_tasks_lifecycle.py` contra
o código pré-task-23 (chamando o wrapper síncrono `process_market_orders` duas vezes seguidas),
a 2ª chamada não estourou a exceção "attached to a different loop" prevista — ela **travou
indefinidamente** (>25 min sem retorno), com a conexão do pool presa ao loop já fechado da 1ª
chamada, esperando I/O que nunca chega. Sintoma mais grave que o diagnóstico original, mas
confirma a causa raiz do `C1`. Depois da correção (engine `NullPool` descartável por task, ver
[23-ciclo-de-vida-async-worker.md](23-ciclo-de-vida-async-worker.md)), as duas chamadas
retornam normalmente e a suíte completa (52 testes) passa.
