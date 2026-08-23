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

# Entrypoint default é a API; o stack de produção sobrescreve o CMD para os jobs,
# workers dedicados e beat. Cada papel também substitui este healthcheck da imagem.
# Migration NÃO roda aqui de propósito — um serviço "migrate" dedicado no
# stack.yml (command: alembic upgrade head, restart_policy condition: none) roda uma vez
# antes de API/worker subirem, em vez de N réplicas da API disputando a migration ao
# mesmo tempo no entrypoint.
# A aplicação valida a cadeia X-Forwarded-For contra TRUSTED_PROXY_CIDRS. Desabilitar a
# reescrita prévia do peer pelo Uvicorn preserva o endereço imediato do Traefik.
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-proxy-headers"]
