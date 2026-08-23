# Albion Profit Pro — Backend

API e pipeline assíncrono responsáveis por autenticação, ingestão de mercado, persistência,
cache, receitas e consultas de preço do Albion Profit Pro.

## Arquitetura

```text
Go client → FastAPI → RabbitMQ → Celery → PostgreSQL
                                      └→ Redis (cache e pub/sub descartáveis)
```

PostgreSQL é a fonte de verdade. O Redis pode ser esvaziado e reconstruído. Dados recebidos são
sempre identificados por realm (`west`, `east` ou `europe`).

## Requisitos e instalação

- Python 3.13;
- `uv`;
- Docker com Compose.

```powershell
Copy-Item '.env.example' '.env'
uv sync --frozen
docker compose up -d
uv run alembic upgrade head
uv run python -m scripts.seed_static_data
```

O seed usa uma revisão imutável e valida SHA-256, tamanho e contagens antes de substituir o
catálogo numa transação. Em ambiente sem acesso externo, monte os dumps e use
`--dataset-dir /datasets`.

## Processos locais

Execute cada papel em um terminal próprio:

```powershell
uv run uvicorn src.main:app --reload
uv run celery -A src.celery_app.celery_app worker -Q ingest -c 4 --loglevel=info
uv run celery -A src.celery_app.celery_app worker -Q maintenance -c 1 --loglevel=info
uv run celery -A src.celery_app.celery_app worker -Q quarantine -c 1 --loglevel=info
uv run celery -A src.celery_app.celery_app beat --loglevel=info
```

`/health` confirma o processo; `/ready` confirma banco, cache e dataset. Migrations e seed são jobs
separados: a API e os workers nunca disputam migrations durante o boot.

## Testes e qualidade

```powershell
uv run ruff check .
uv run ruff format --check .
uv run pytest tests/ -v
docker build -t profitpro-backend .
```

A suíte usa containers efêmeros reais de PostgreSQL, Redis e RabbitMQ. Não é necessário iniciar o
Compose antes do `pytest`, mas o daemon Docker precisa estar disponível.

## Produção

O [stack de referência](stack.production.example.yml) declara jobs de migration e seed, API,
workers dedicados por fila e beat. Antes do deploy:

1. substitua a imagem por digest ou tag imutável;
2. crie os secrets externos declarados no stack;
3. adapte redes e labels ao Swarm real;
4. configure `CORS_ORIGINS` e `TRUSTED_PROXY_CIDRS` com valores exatos;
5. mantenha o Uvicorn com `--no-proxy-headers`, pois a aplicação valida o peer imediato;
6. confirme que o Traefik não aceita forwarded headers de origens não confiáveis.

Falhas definitivas das tasks Celery ficam em quarentena durável no PostgreSQL e podem ser
inspecionadas/reprocessadas pelos comandos documentados em
[docs/08-quarentena-e-falhas-celery.md](../docs/08-quarentena-e-falhas-celery.md). Operação das
filas e do Swarm está em
[docs/09-operacao-celery-e-swarm.md](../docs/09-operacao-celery-e-swarm.md).

## Organização

O código é separado por domínio em `src/`: `auth`, `api_tokens`, `ingest`, `prices`, `recipes`,
`static_data`, `quarantine`, `operations` e `cache`. Cada mudança de contrato deve atualizar os
testes e a documentação correspondente em [`docs/`](../docs/README.md).
