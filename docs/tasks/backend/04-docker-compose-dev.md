# 04 — Docker Compose de desenvolvimento local

## Objetivo
Subir Postgres 16, Redis e RabbitMQ localmente via Docker, isolados da infra real de produção do usuário (que já roda em Swarm) — pra desenvolver e testar sem risco de misturar dados de teste com dados reais.

## Por que
Decisão já confirmada com o usuário: ambiente de dev usa Docker local, migração pra infra real (Traefik/Swarm) só acontece no deploy. Isso também combina com a task 20 (testes automatizados via `testcontainers`, que sobe containers efêmeros do mesmo tipo).

## O que implementar
`backend/docker-compose.yml`:
```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: profitpro
      POSTGRES_PASSWORD: profitpro
      POSTGRES_DB: profitpro
    ports:
      - "5433:5432"  # ver nota abaixo sobre conflito de porta
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U profitpro"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7
    ports:
      - "6380:6379"  # ver nota abaixo sobre conflito de porta
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

  rabbitmq:
    image: rabbitmq:3-management
    ports:
      - "5672:5672"   # protocolo AMQP
      - "15672:15672" # painel de management (http://localhost:15672, guest/guest)
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
```

Notas de implementação:
- **Portas remapeadas (implementado em 2026-08-21)**: na máquina de dev, as portas padrão 5432 (Postgres) e 6379 (Redis) já estavam em uso por outro projeto local rodando em Docker (`chatwoot-noble-postgres-1`/`chatwoot-noble-redis-1`). Por isso o host expõe **5433** (Postgres) e **6380** (Redis) — a porta *dentro* do container continua padrão (5432/6379), só o mapeamento externo muda. `.env`/`.env.example` já refletem isso (`DATABASE_URL`/`REDIS_URL` usam `localhost:5433`/`localhost:6380`). Se essa máquina específica não tiver mais esse conflito no futuro, dá pra voltar pras portas padrão — não é uma decisão de arquitetura, só uma acomodação local.
- Usar a **mesma versão do Postgres (16)** que a infra real, pra evitar surpresas de compatibilidade de migration na hora do deploy.
- Não incluir a API/worker neste compose por padrão — desenvolvimento roda `uv run uvicorn ...`/`uv run celery ...` direto no host, contra esses 3 serviços em container (mais rápido pra iterar, sem rebuild de imagem a cada mudança). A task 21 (Dockerfile de produção) cobre a versão containerizada da API/worker, que pode ser adicionada a este mesmo compose como serviços opcionais depois.

## Bibliotecas/dependências
Nenhuma — só Docker/Docker Compose (já instalado).

## Depende de
Nada além do Docker Desktop já instalado. Pode ser feito em paralelo com as tasks 01-03.

## Testes manuais
1. `cd backend && docker compose up -d`
2. `docker compose ps` → os 3 serviços devem estar `healthy`.
3. `psql postgresql://profitpro:profitpro@localhost:5433/profitpro -c "SELECT 1"` (ou client gráfico) → confirma acesso ao Postgres.
4. `redis-cli -h localhost -p 6380 ping` → deve responder `PONG`.
5. Abrir `http://localhost:15672` (guest/guest) → painel do RabbitMQ deve carregar.
6. `docker compose down -v` → derruba tudo e limpa o volume (usar quando quiser resetar o banco local do zero).

## Testes automatizados
Nenhum diretamente — este compose é infraestrutura de desenvolvimento, não código testável. A task 20 usa `testcontainers` (que sobe containers próprios, independentes deste compose) para os testes automatizados de verdade.
