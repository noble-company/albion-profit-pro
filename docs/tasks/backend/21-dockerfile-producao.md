# 21 — Dockerfile de produção

> ⚠️ **Spec revisada em 2026-08-22.** A imagem funciona pra API e pro worker, mas **não consegue
> aplicar migrations**: `alembic` está em `[dependency-groups] dev` e o build usa
> `uv sync --no-dev`. O deploy quebraria na primeira execução. Achados `A4`/`P7` (mais: roda
> como root, `COPY` redundante, sem `HEALTHCHECK`) →
> [task 34](34-migrations-em-producao-e-dockerfile.md).


## Objetivo
Imagem Docker multi-stage do backend, com entrypoints separados pra API (`uvicorn`) e worker (`celery`), pronta pra ser publicada como serviços no Docker Swarm existente do usuário (Traefik + rede overlay).

## Por que
API e worker compartilham o mesmo código-fonte e dependências, mas rodam como processos/serviços separados no swarm (escalam independentemente — pode ter 1 API e 3 workers, por exemplo). Multi-stage build mantém a imagem final enxuta (sem ferramentas de build/dev).

## O que implementar
`backend/Dockerfile`:
```dockerfile
FROM python:3.13-slim AS builder

RUN pip install uv
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY . .
RUN uv sync --frozen --no-dev

FROM python:3.13-slim AS runtime

WORKDIR /app
COPY --from=builder /app/.venv /app/.venv
COPY --from=builder /app /app
ENV PATH="/app/.venv/bin:$PATH"

# Entrypoint default é a API; o serviço "worker" no stack.yml sobrescreve o CMD
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

Wiring de dois serviços a partir da mesma imagem (exemplo local via `docker-compose.yml` da task 04, estendido — ou no `stack.yml` real do usuário, quando ele compartilhar o padrão, conforme registrado como pendência no plano macro):
```yaml
services:
  api:
    build: .
    command: uvicorn src.main:app --host 0.0.0.0 --port 8000
    env_file: .env
    ports:
      - "8000:8000"
    depends_on:
      postgres: {condition: service_healthy}
      redis: {condition: service_healthy}
      rabbitmq: {condition: service_healthy}

  worker:
    build: .
    command: celery -A src.celery_app.celery_app worker --loglevel=info
    env_file: .env
    depends_on:
      postgres: {condition: service_healthy}
      redis: {condition: service_healthy}
      rabbitmq: {condition: service_healthy}
```

Notas:
- `uv sync --frozen` exige que `uv.lock` exista e esteja commitado (gerado automaticamente pelo `uv add`/`uv sync` ao longo das tasks anteriores) — garante build determinístico (mesmas versões exatas em dev e produção).
- Separar `uv sync --no-install-project` (só dependências) do `uv sync` final (com o projeto) é uma otimização de cache de camadas Docker — mudanças no código não invalidam o cache de instalação de dependências.
- Labels do Traefik (`traefik.http.routers.api.rule=Host(...)`, rede overlay) ficam de fora deste Dockerfile — são específicos do `stack.yml` real do usuário, que será compartilhado antes do deploy (pendência já registrada no plano macro).

## Bibliotecas/dependências
Nenhuma nova — usa o que já foi instalado nas tasks anteriores, via `uv.lock`.

## Depende de
Todas as tasks anteriores que produzem código de aplicação (07 em diante) — na prática, esta task só faz sentido rodar por último, como fechamento.

## Testes manuais
1. `cd backend && docker build -t profitpro-backend .` → build completa sem erro.
2. `docker run --rm profitpro-backend uvicorn --version` (ou equivalente) → confirma que o binário/venv dentro da imagem funciona.
3. Rodar a imagem apontando pro docker-compose de dev (task 04) via `--network` compartilhada, confirmar que a API sobe e responde em `/health` (task 22).
4. Rodar a mesma imagem com `command: celery ...` → confirma que o worker também sobe a partir da mesma imagem.

## Testes automatizados
Não aplicável via pytest — validação de Dockerfile é melhor feita via CI (`docker build` como step de pipeline) ou manualmente. Se o projeto tiver CI configurado depois, adicionar um step de `docker build` como smoke test.

## Notas de implementação (2026-08-22)

- Adicionado `backend/.dockerignore` (não estava na spec) — sem ele, `COPY . .` copiaria o `.env` real (com `JWT_SECRET`/credenciais de banco) pra dentro da camada da imagem. Exclui `.env`, `.venv`, `__pycache__`, `.git`, `tests/`.
- Testado de ponta a ponta contra o `docker-compose.yml` de dev (task 04): subi a imagem como API (rede `backend_default`, apontando `DATABASE_URL`/`REDIS_URL`/`RABBITMQ_URL` pros nomes internos dos serviços) e confirmei um `POST /auth/register` real gravando no Postgres; subi a mesma imagem com `command: celery -A src.celery_app.celery_app worker --loglevel=info` e confirmei conexão real com RabbitMQ+Redis (log mostra `transport: amqp://guest:**@rabbitmq:5672//` e `results: redis://redis:6379/0`).
- Item 3 dos testes manuais da spec original pedia checar `/health` — isso é entrega da task 22 (Observabilidade), ainda não implementada. Testei contra `/docs` (já existente) no lugar; revisitar esse teste específico quando a 22 estiver pronta.
- **Achado de segurança, não corrigido nesta task** (fora do escopo pedido, registrando como pendência): o container roda como root (`SecurityWarning` do Celery: `You're running the worker with superuser privileges`). O Dockerfile não cria um usuário não-root. Se for pra produção de verdade, vale adicionar um `USER` não-root nos dois estágios — não fiz isso agora pra não expandir o escopo desta task sem alinhar antes (pode exigir ajuste de permissões do `.venv` copiado do builder).
