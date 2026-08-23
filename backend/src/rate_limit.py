"""Rate limiting (task 33, achado A6), Redis como backend — o limite vale entre réplicas.

Contador de janela fixa (`INCR` + `EXPIRE`) via Redis, não uma lib de terceiros. Avaliadas
duas (`slowapi`, sem release há mais de 2 anos; e `pyrate-limiter`/`fastapi-limiter`, ativa,
mas com dois problemas reais medidos rodando de verdade): `Limiter.try_acquire_async` tem
`blocking=True` por padrão — sem notar isso, ele **espera** até o limite liberar (até 60s)
em vez de rejeitar na hora, e o `RedisBucket` aplica a taxa ao bucket inteiro, não por
`name`/identificador — duas pessoas diferentes competem pelo mesmo orçamento a menos que
cada uma ganhe seu próprio bucket físico (o que exigiria uma `BucketFactory` customizada
só pra replicar o que um `INCR` já faz em 3 linhas). Dado o requisito real (contar e
comparar com um teto, por identificador, dentro de uma janela), a lib complica mais do que
resolve — daí a escolha por menos abstração aqui, não o padrão geral do projeto."""

from fastapi import HTTPException, Request
from starlette.status import HTTP_429_TOO_MANY_REQUESTS

from src.cache.redis_client import get_redis


async def identificar_por_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "sem-ip"


async def identificar_por_token(request: Request) -> str:
    """Chave de rate limit pro ingest: por token de API, não por IP — vários usuários
    legítimos podem sair do mesmo NAT (achado A6)."""
    return request.headers.get("authorization", "sem-token")


def rate_limit(bucket_key: str, limit: int, seconds: int, identifier=identificar_por_ip):
    """Dependency FastAPI: `limit` requisições por `seconds` segundos, por chave de
    `identifier` + path da rota — path entra na chave, então um `bucket_key` pode ser
    compartilhado por várias rotas sem elas dividirem o mesmo orçamento."""

    async def dependency(request: Request) -> None:
        redis = get_redis()
        key = f"{bucket_key}:{await identifier(request)}:{request.url.path}"
        count = await redis.incr(key)
        if count == 1:
            await redis.expire(key, seconds)
        if count > limit:
            raise HTTPException(status_code=HTTP_429_TOO_MANY_REQUESTS, detail="Too Many Requests")

    return dependency
