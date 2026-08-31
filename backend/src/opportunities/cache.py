import hashlib
import json

from src.cache.redis_client import get_redis

CACHE_TTL_SECONDS = 30


def cache_key(kind: str, params: dict) -> str:
    payload = json.dumps(params, sort_keys=True, default=str, separators=(",", ":"))
    digest = hashlib.sha256(payload.encode()).hexdigest()
    return f"opportunities:v2:{kind}:{digest}"


async def get_cached(kind: str, params: dict) -> dict | None:
    raw = await get_redis().get(cache_key(kind, params))
    return json.loads(raw) if raw else None


async def set_cached(kind: str, params: dict, payload: dict) -> None:
    await get_redis().set(
        cache_key(kind, params),
        json.dumps(payload, default=str),
        ex=CACHE_TTL_SECONDS,
    )
