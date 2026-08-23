#!/usr/bin/env bash
# Task 34 — build da imagem de produção + os testes manuais da spec, num script só.
# Build de imagem Docker não entra no pytest (lento, depende de Docker rodando) — esta
# task é validada por este script, não pela suíte automatizada (ver
# docs/tasks/backend/README.md).
#
# Requer: `docker compose up -d` já rodando (backend/docker-compose.yml) — o script conecta
# na mesma rede pra alcançar Postgres/Redis/RabbitMQ pelo nome do serviço.
set -euo pipefail

cd "$(dirname "$0")/.."

IMAGE=profitpro-backend-check
NETWORK=$(docker network ls --filter name=backend_default -q | head -n1)

if [ -z "$NETWORK" ]; then
  echo "Rede 'backend_default' não encontrada — rode 'docker compose up -d' antes." >&2
  exit 1
fi

ENV_ARGS=(
  -e DATABASE_URL=postgresql+asyncpg://profitpro:profitpro@postgres:5432/profitpro
  -e REDIS_URL=redis://redis:6379/0
  -e RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672//
  -e JWT_SECRET=script-de-verificacao-nao-usar-em-producao-32ch
)

echo "== 1. build =="
docker build -t "$IMAGE" .

echo "== 2. alembic upgrade head dentro do container =="
docker run --rm --network "$NETWORK" "${ENV_ARGS[@]}" "$IMAGE" alembic upgrade head

echo "== 3. usuário não-root =="
WHOAMI=$(docker run --rm "$IMAGE" whoami)
if [ "$WHOAMI" != "app" ]; then
  echo "esperado 'app', veio '$WHOAMI'" >&2
  exit 1
fi
echo "ok: $WHOAMI"

echo "== 4. HEALTHCHECK fica healthy =="
CID=$(docker run -d --network "$NETWORK" "${ENV_ARGS[@]}" -p 18000:8000 "$IMAGE")
trap 'docker rm -f "$CID" >/dev/null 2>&1 || true' EXIT

STATUS="starting"
for _ in $(seq 1 20); do
  STATUS=$(docker inspect --format='{{.State.Health.Status}}' "$CID" 2>/dev/null || echo "starting")
  if [ "$STATUS" = "healthy" ]; then
    echo "ok: healthy"
    break
  fi
  if [ "$STATUS" = "unhealthy" ]; then
    echo "container ficou unhealthy" >&2
    docker logs "$CID" >&2
    exit 1
  fi
  sleep 2
done

if [ "$STATUS" != "healthy" ]; then
  echo "não ficou healthy a tempo (status: $STATUS)" >&2
  docker logs "$CID" >&2
  exit 1
fi

echo "== 5. comando do worker sobe sem cair =="
docker run -d --name profitpro-backend-check-worker --network "$NETWORK" "${ENV_ARGS[@]}" "$IMAGE" \
  celery -A src.celery_app.celery_app worker --loglevel=info >/dev/null
trap 'docker rm -f "$CID" profitpro-backend-check-worker >/dev/null 2>&1 || true' EXIT
sleep 5
if [ "$(docker inspect --format='{{.State.Running}}' profitpro-backend-check-worker)" != "true" ]; then
  echo "worker morreu na subida" >&2
  docker logs profitpro-backend-check-worker >&2
  exit 1
fi
echo "ok: worker subiu e continua rodando"

echo
echo "Tudo certo."
