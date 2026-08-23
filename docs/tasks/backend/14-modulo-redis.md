# 14 — Módulo Redis (cache + pub/sub)

## Objetivo
Um módulo isolado (`src/cache/redis_client.py`) com funções simples de get/set com TTL (pra cache de "preço mais recente") e publish em canal pub/sub (pra push em tempo real pro frontend) — usado pelo worker (task 17) e pelo router de leitura (task 18).

## Por que
Isolar o acesso ao Redis num módulo próprio (em vez de espalhar `redis.get(...)` pelo código) facilita trocar de estratégia de cache depois sem tocar em quem consome. Cache é só um atalho de leitura — como já esclarecido antes, Postgres continua sendo a fonte da verdade; se o Redis for zerado, nada se perde.

## O que implementar
`src/cache/redis_client.py`:
```python
import json
from redis.asyncio import Redis

from src.config import get_settings

settings = get_settings()

_redis: Redis | None = None


def get_redis() -> Redis:
    global _redis
    if _redis is None:
        _redis = Redis.from_url(settings.redis_url, decode_responses=True)
    return _redis


def _price_cache_key(item_id: str, location_id: str, quality_level: int) -> str:
    return f"price:{item_id}:{location_id}:{quality_level}"


async def set_latest_price(item_id: str, location_id: str, quality_level: int, payload: dict, ttl_seconds: int = 300) -> None:
    redis = get_redis()
    key = _price_cache_key(item_id, location_id, quality_level)
    await redis.set(key, json.dumps(payload), ex=ttl_seconds)


async def get_latest_price(item_id: str, location_id: str, quality_level: int) -> dict | None:
    redis = get_redis()
    key = _price_cache_key(item_id, location_id, quality_level)
    raw = await redis.get(key)
    return json.loads(raw) if raw else None


async def publish_price_update(item_id: str, payload: dict) -> None:
    """Canal pub/sub — o frontend com WebSocket aberto assina 'prices:<item_id>' e recebe em tempo real."""
    redis = get_redis()
    await redis.publish(f"prices:{item_id}", json.dumps(payload))
```

Notas:
- TTL padrão de 5 minutos (`300s`) — se o cache expirar e ninguém atualizar (ex: item sem atividade recente), a leitura (task 18) cai pro Postgres automaticamente, sem quebrar nada.
- Chave de cache por `(item_id, location_id, quality_level)` — bate exatamente com o índice composto criado no `MarketOrder` (task 10), então a lógica de "o que cachear" e "como consultar" ficam simétricas.
- `publish_price_update` é usado pelo worker (task 17) depois de gravar — o consumo desse canal pub/sub (WebSocket) é responsabilidade do **frontend** (Fase 3, fora deste plano de backend), aqui só deixamos o lado de publish pronto.

## Bibliotecas/dependências
- `uv add redis` (o pacote `redis` já inclui suporte async em `redis.asyncio`, não precisa de `aioredis` separado — esse projeto foi descontinuado e mergeado no `redis-py` oficial)

## Depende de
Task 03 (configuração), Task 04 (Redis local pra testar).

## Testes manuais
1. Com Redis do docker-compose rodando:
   ```bash
   uv run python -c "
   import asyncio
   from src.cache.redis_client import set_latest_price, get_latest_price

   async def check():
       await set_latest_price('T2_FIBER', '1002', 1, {'price': 100})
       print(await get_latest_price('T2_FIBER', '1002', 1))

   asyncio.run(check())
   "
   ```
   Deve imprimir `{'price': 100}`.
2. `redis-cli -h localhost GET "price:T2_FIBER:1002:1"` → confirma a chave gravada com TTL (`TTL <chave>` deve mostrar segundos restantes).

## Testes automatizados
- `tests/test_redis_client.py`: usa a fixture de Redis via testcontainers (task 20) — testa `set_latest_price`/`get_latest_price` (roundtrip), TTL expirando (usar `ex=1` e `asyncio.sleep(1.5)` no teste), e que `publish_price_update` não levanta erro mesmo sem nenhum subscriber (comportamento padrão do Redis pub/sub).
