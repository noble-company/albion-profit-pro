# 34 — Migrations em produção e endurecimento do Dockerfile

> Corrige **A4** e **P7** de [../../04-revisao-fase-1.md](../../04-revisao-fase-1.md).

## Objetivo
Tornar a imagem de produção capaz de aplicar migrations, e arrumar os pontos de higiene do
Dockerfile que a task 21 deixou passar.

## Por que

**A imagem não consegue rodar migration (A4).** `alembic` está declarado em
`[dependency-groups] dev` (`pyproject.toml:47`) e o `Dockerfile` faz `uv sync --frozen
--no-dev` (linhas 6 e 9). Ou seja: `alembic upgrade head` **não existe dentro do container**. A
task 21 foi validada rodando a API e o worker, e migration nunca foi exercitada a partir da
imagem — o deploy vai quebrar exatamente na primeira vez que for feito.

**Higiene (P7):**
- Roda como **root**. Um processo que faz parsing de JSON vindo da internet não deveria.
- `COPY --from=builder /app/.venv /app/.venv` seguido de `COPY --from=builder /app /app` — o
  segundo já inclui o primeiro. Redundante e confuso sobre qual camada manda.
- Sem `PYTHONUNBUFFERED=1`: log de container sai truncado/atrasado, o que atrapalha justamente
  quando algo está quebrando.
- Sem `PYTHONDONTWRITEBYTECODE=1`: `.pyc` inútil numa imagem imutável.
- Sem `HEALTHCHECK` — temos `/health` e `/ready` prontos desde a task 22 e não usados.

## O que implementar

### 1. Alembic como dependência de runtime
Mover `alembic` de `[dependency-groups] dev` pra `[project] dependencies`. É dependência de
operação, não de desenvolvimento — a mesma imagem precisa poder migrar.

### 2. Dockerfile
```dockerfile
FROM python:3.13-slim AS builder
RUN pip install uv
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY . .
RUN uv sync --frozen --no-dev

FROM python:3.13-slim AS runtime
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/app/.venv/bin:$PATH"

RUN useradd --create-home --uid 10001 app
WORKDIR /app
COPY --from=builder --chown=app:app /app /app
USER app

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8000/health').status==200 else 1)"

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
```
Um `COPY` só (o `/app` já traz o `.venv`). O `HEALTHCHECK` usa `/health` (liveness), não
`/ready` — `/ready` depende de Postgres/Redis e faria o Docker reiniciar o container por um
problema que não é dele. `/ready` fica pro Traefik/Swarm decidir roteamento.

### 3. Como as migrations rodam no deploy
Documentar a decisão (e registrar no `docs/00-plano-macro.md`, seção de deploy). Opções:
- **Preferida**: um serviço `migrate` no `stack.yml` com
  `command: alembic upgrade head` e `deploy.restart_policy.condition: none`, que roda até o fim
  e sai; API e worker dependem dele.
- Alternativa: entrypoint da API roda `alembic upgrade head` antes do uvicorn. Simples, mas com
  N réplicas subindo juntas há N migrations concorrentes — o Alembic segura com lock, mas o
  deploy fica mais lento e mais barulhento.

**Não** rodar migration automaticamente no worker.

### 4. `.dockerignore`
Já está bom (exclui `.env`, `.venv`, `tests/`, `.git`). Conferir que
`backend/tests/fixtures/wire/` não é necessário em runtime — é de teste, e `tests/` já está
excluído.

## Bibliotecas/dependências
Nenhuma nova — só mover `alembic` de grupo.

## Depende de
Nada em código. Faz sentido depois das tasks 23-31, porque as migrations delas precisam ser
aplicáveis pela imagem.

## Testes manuais
1. `docker build -t profitpro-backend .`
2. `docker run --rm --env-file .env profitpro-backend alembic upgrade head` → **funciona**
   (hoje falha com `alembic: not found`).
3. `docker run --rm profitpro-backend whoami` → `app`, não `root`.
4. `docker inspect` → `Health` presente; subir o container e confirmar que fica `healthy`.
5. Rodar a mesma imagem com o comando do worker e confirmar que consome da fila.

## Testes automatizados
Difícil cobrir build de imagem no pytest sem deixar a suíte lenta e dependente de Docker. Fazer
como **check de CI separado** (ou script `scripts/check_image.sh`): build + os quatro comandos
do teste manual. Registrar no `docs/tasks/backend/README.md` que esta task é validada por
script, não pela suíte.
