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


def new_redis_client() -> Redis:
    """Instância nova, sem cache global — pro worker Celery, que cria/descarta recursos
    a cada task (ver src/ingest/tasks.py e docs/tasks/backend/23-ciclo-de-vida-async-worker.md)."""
    return Redis.from_url(settings.redis_url, decode_responses=True)


def _book_cache_key(
    item_id: str, location_id: str, quality_level: int, enchantment_level: int
) -> str:
    return f"livro:{item_id}:{location_id}:{quality_level}:{enchantment_level}"


async def set_book_depth(
    redis: Redis,
    item_id: str,
    location_id: str,
    quality_level: int,
    enchantment_level: int,
    payload: dict,
    ttl_seconds: int = 300,
) -> None:
    """Grava a profundidade do livro (compra/venda separados) + giro de 24h pra uma
    combinação (item, local, qualidade, encantamento). Formato definido na task 29 —
    substitui o `price:...` de preço solto por lado (achado C3: misturar os dois lados podia
    fazer o preço cacheado virar 1 silver e a calculadora achar lucro infinito)."""
    key = _book_cache_key(item_id, location_id, quality_level, enchantment_level)
    await redis.set(key, json.dumps(payload), ex=ttl_seconds)


async def mget_book_depths(
    redis: Redis, item_id: str, combos: list[tuple[str, int, int]]
) -> dict[tuple[str, int, int], dict | None]:
    """`combos` é uma lista de (location_id, quality_level, enchantment_level). Um único
    MGET pra todas as chaves candidatas — é o que evita os até 80 round-trips por request
    (achado M1)."""
    if not combos:
        return {}
    keys = [_book_cache_key(item_id, loc, q, e) for loc, q, e in combos]
    raw_values = await redis.mget(keys)
    return {
        combo: (json.loads(raw) if raw else None)
        for combo, raw in zip(combos, raw_values, strict=True)
    }


async def publish_price_update(redis: Redis, item_id: str, payload: dict) -> None:
    """Canal pub/sub — o frontend com WebSocket aberto assina 'prices:<item_id>' e recebe em tempo real."""
    await redis.publish(f"prices:{item_id}", json.dumps(payload))
