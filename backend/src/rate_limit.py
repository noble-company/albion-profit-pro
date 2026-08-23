"""Rate limiting distribuido e seguro, com Redis como backend.

O contador usa Lua para que ``INCR`` e ``EXPIRE`` sejam uma unica operacao atomica. As
identidades derivadas de credenciais usam HMAC; nenhum token funcional vai para uma chave Redis.
"""

import hashlib
import hmac
import ipaddress
from collections.abc import Awaitable, Callable
from functools import lru_cache
from typing import Literal

import structlog
from fastapi import HTTPException, Request
from redis.asyncio import Redis
from redis.exceptions import RedisError
from starlette.status import HTTP_429_TOO_MANY_REQUESTS, HTTP_503_SERVICE_UNAVAILABLE

from src.cache.redis_client import get_redis
from src.config import get_settings

log = structlog.get_logger()

RedisFailureMode = Literal["open", "closed"]
Identifier = Callable[[Request], Awaitable[str]]

_INCREMENT_WITH_TTL_SCRIPT = """
local current = redis.call("INCR", KEYS[1])
if current == 1 then
    redis.call("EXPIRE", KEYS[1], ARGV[1])
end
return current
"""


@lru_cache
def _trusted_networks(
    cidrs: tuple[str, ...],
) -> tuple[ipaddress.IPv4Network | ipaddress.IPv6Network, ...]:
    return tuple(ipaddress.ip_network(cidr, strict=False) for cidr in cidrs)


def _parse_ip(value: str) -> ipaddress.IPv4Address | ipaddress.IPv6Address | None:
    try:
        return ipaddress.ip_address(value.strip())
    except ValueError:
        return None


def _is_trusted(ip: ipaddress.IPv4Address | ipaddress.IPv6Address, networks) -> bool:
    return any(ip.version == network.version and ip in network for network in networks)


async def identificar_por_ip(request: Request) -> str:
    """Identifica o cliente sem aceitar forwarded headers de peers arbitrarios."""

    peer = request.client.host if request.client else "sem-ip"
    peer_ip = _parse_ip(peer)
    networks = _trusted_networks(tuple(get_settings().trusted_proxy_cidrs))
    if peer_ip is None or not _is_trusted(peer_ip, networks):
        return peer

    forwarded = request.headers.get("x-forwarded-for")
    if not forwarded:
        return peer

    chain = [_parse_ip(value) for value in forwarded.split(",")]
    if any(ip is None for ip in chain):
        return peer

    # Traefik acrescenta o hop anterior a direita. Ignorar proxies conhecidos nessa
    # direcao impede que um X-Forwarded-For injetado a esquerda escolha a identidade.
    for candidate in reversed(chain):
        assert candidate is not None  # comprovado pela validacao acima
        if not _is_trusted(candidate, networks):
            return str(candidate)
    return peer


def identificar_tentativa_por_token(authorization: str | None) -> str:
    """Produz identidade opaca e estavel para requests sem token validado."""

    value = authorization or "<token-ausente>"
    payload = b"albion-profit-pro:rate-limit:api-token:v1\0" + value.encode()
    digest = hmac.new(get_settings().jwt_secret.encode(), payload, hashlib.sha256).hexdigest()
    return f"tentativa:{digest}"


async def increment_with_ttl(redis: Redis, key: str, seconds: int) -> int:
    """Incrementa o contador e garante TTL na mesma operacao atomica do Redis."""

    return int(await redis.eval(_INCREMENT_WITH_TTL_SCRIPT, 1, key, seconds))


async def enforce_rate_limit(
    request: Request,
    *,
    bucket_key: str,
    identifier: str,
    limit: int,
    seconds: int,
    redis_failure: RedisFailureMode,
) -> None:
    key = f"{bucket_key}:{identifier}:{request.url.path}"
    try:
        count = await increment_with_ttl(get_redis(), key, seconds)
    except RedisError:
        log.error(
            "rate_limit.redis_indisponivel",
            bucket=bucket_key,
            path=request.url.path,
            comportamento=redis_failure,
            exc_info=True,
        )
        if redis_failure == "closed":
            raise HTTPException(
                status_code=HTTP_503_SERVICE_UNAVAILABLE,
                detail="Servico temporariamente indisponivel",
            ) from None
        return

    if count > limit:
        raise HTTPException(status_code=HTTP_429_TOO_MANY_REQUESTS, detail="Too Many Requests")


def rate_limit(
    bucket_key: str,
    limit: int,
    seconds: int,
    identifier: Identifier = identificar_por_ip,
    *,
    redis_failure: RedisFailureMode = "closed",
):
    """Dependency para limites nao autenticados, normalmente login e registro."""

    async def dependency(request: Request) -> None:
        await enforce_rate_limit(
            request,
            bucket_key=bucket_key,
            identifier=await identifier(request),
            limit=limit,
            seconds=seconds,
            redis_failure=redis_failure,
        )

    return dependency
