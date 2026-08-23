import json

from redis.asyncio import Redis

from src.config import get_settings

settings = get_settings()

_redis: Redis | None = None
BOOK_CACHE_VERSION = "v2"


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
    server_id: str, item_id: str, location_id: str, quality_level: int, enchantment_level: int
) -> str:
    return (
        f"livro:{BOOK_CACHE_VERSION}:{server_id}:{item_id}:"
        f"{location_id}:{quality_level}:{enchantment_level}"
    )


async def set_book_depth(
    redis: Redis,
    server_id: str,
    item_id: str,
    location_id: str,
    quality_level: int,
    enchantment_level: int,
    payload: dict,
    ttl_seconds: int = 300,
) -> None:
    """Grava compra/venda e giro de 24h sem misturar os lados do livro."""
    key = _book_cache_key(server_id, item_id, location_id, quality_level, enchantment_level)
    await redis.set(key, json.dumps(payload), ex=ttl_seconds)


async def mget_book_depths(
    redis: Redis, server_id: str, item_id: str, combos: list[tuple[str, int, int]]
) -> dict[tuple[str, int, int], dict | None]:
    """Busca as combinações em um único MGET para evitar um round-trip por chave."""
    if not combos:
        return {}
    keys = [_book_cache_key(server_id, item_id, loc, q, e) for loc, q, e in combos]
    raw_values = await redis.mget(keys)
    return {
        combo: (json.loads(raw) if raw else None)
        for combo, raw in zip(combos, raw_values, strict=True)
    }


async def delete_book_depth(
    redis: Redis,
    server_id: str,
    item_id: str,
    location_id: str,
    quality_level: int,
    enchantment_level: int,
) -> None:
    """Remove uma combinação após uma recomputação confirmar que ela ficou vazia."""
    await redis.delete(
        _book_cache_key(server_id, item_id, location_id, quality_level, enchantment_level)
    )


async def publish_price_update(redis: Redis, server_id: str, item_id: str, payload: dict) -> None:
    """Canal pub/sub — o frontend com WebSocket aberto assina 'prices:<item_id>' e recebe em tempo real."""
    await redis.publish(f"prices:{server_id}:{item_id}", json.dumps(payload))
