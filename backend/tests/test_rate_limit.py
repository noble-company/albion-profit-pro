import asyncio
import hashlib
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from redis.exceptions import RedisError
from starlette.requests import Request

import src.rate_limit as rate_limit_module
from src.api_tokens.service import create_token, get_valid_token
from src.cache.redis_client import get_redis
from src.database import async_session_maker
from src.rate_limit import enforce_rate_limit, identificar_por_ip, increment_with_ttl


def _request(peer: str, *, path: str = "/auth/login", forwarded: str | None = None) -> Request:
    headers = []
    if forwarded is not None:
        headers.append((b"x-forwarded-for", forwarded.encode()))
    return Request(
        {
            "type": "http",
            "http_version": "1.1",
            "method": "GET",
            "scheme": "http",
            "path": path,
            "raw_path": path.encode(),
            "query_string": b"",
            "headers": headers,
            "client": (peer, 12345),
            "server": ("test", 80),
            "root_path": "",
        }
    )


async def _rate_limit_keys(pattern: str = "rl:*") -> list[str]:
    return [key async for key in get_redis().scan_iter(match=pattern)]


async def test_chave_de_token_valido_usa_id_e_nunca_o_segredo(client, db_session, usuario):
    created = await create_token(db_session, usuario.id)
    raw_token = created.token

    response = await client.get("/client/me", headers={"Authorization": f"Bearer {raw_token}"})
    assert response.status_code == 200, response.text

    keys = await _rate_limit_keys("rl:client:*")
    assert len(keys) == 1
    assert f":api-token:{created.id}:" in keys[0]
    assert raw_token not in keys[0]
    assert hashlib.sha256(raw_token.encode()).hexdigest() not in keys[0]
    assert raw_token[-8:] not in keys[0]
    assert "Bearer" not in keys[0]


async def test_tentativa_invalida_usa_hmac_sem_expor_token(client):
    raw_token = "apk_segredo-que-nao-pode-aparecer-no-redis"

    response = await client.get("/client/me", headers={"Authorization": f"Bearer {raw_token}"})
    assert response.status_code == 401

    keys = await _rate_limit_keys("rl:client:*")
    assert len(keys) == 1
    assert ":tentativa:" in keys[0]
    assert raw_token not in keys[0]
    assert raw_token[-8:] not in keys[0]
    assert "Bearer" not in keys[0]


async def test_tokens_distintos_usam_buckets_distintos(client, db_session, usuario):
    first = await create_token(db_session, usuario.id)
    second = await create_token(db_session, usuario.id)

    for raw in (first.token, second.token):
        response = await client.get("/client/me", headers={"Authorization": f"Bearer {raw}"})
        assert response.status_code == 200, response.text

    keys = await _rate_limit_keys("rl:client:*")
    assert len(keys) == 2
    assert any(str(first.id) in key for key in keys)
    assert any(str(second.id) in key for key in keys)


async def test_mesmo_token_compartilha_contador_entre_replicas_simuladas(db_session, usuario):
    created = await create_token(db_session, usuario.id)
    # Uma nova consulta simula outra replica resolvendo a mesma credencial no Postgres.
    async with async_session_maker() as other_session:
        resolved_elsewhere = await get_valid_token(other_session, created.token)
        assert resolved_elsewhere is not None
        assert resolved_elsewhere.id == created.id

    request = _request("198.51.100.20", path="/client/me")
    for token in (created, resolved_elsewhere):
        await enforce_rate_limit(
            request,
            bucket_key="rl:replicas",
            identifier=f"api-token:{token.id}",
            limit=10,
            seconds=60,
            redis_failure="closed",
        )

    key = f"rl:replicas:api-token:{created.id}:/client/me"
    assert await get_redis().get(key) == "2"


async def test_forwarded_for_forjado_de_peer_nao_confiavel_e_ignorado(monkeypatch):
    monkeypatch.setattr(
        rate_limit_module,
        "get_settings",
        lambda: SimpleNamespace(trusted_proxy_cidrs=["10.0.0.0/8"]),
    )
    request = _request("198.51.100.9", forwarded="203.0.113.77")

    assert await identificar_por_ip(request) == "198.51.100.9"


async def test_proxy_confiavel_extrai_primeiro_hop_nao_confiavel_da_direita(monkeypatch):
    monkeypatch.setattr(
        rate_limit_module,
        "get_settings",
        lambda: SimpleNamespace(trusted_proxy_cidrs=["10.0.0.0/8"]),
    )
    # O valor a esquerda pode ter sido injetado pelo cliente; Traefik acrescenta o RemoteAddr
    # real a direita. A politica nunca escolhe o valor forjado neste caso.
    request = _request("10.0.0.4", forwarded="192.0.2.200, 203.0.113.77")

    assert await identificar_por_ip(request) == "203.0.113.77"


async def test_cadeia_forwarded_malformada_cai_para_peer_confiavel(monkeypatch):
    monkeypatch.setattr(
        rate_limit_module,
        "get_settings",
        lambda: SimpleNamespace(trusted_proxy_cidrs=["10.0.0.0/8"]),
    )
    request = _request("10.0.0.4", forwarded="valor-invalido, 203.0.113.77")

    assert await identificar_por_ip(request) == "10.0.0.4"


async def test_incremento_concorrente_sempre_cria_ttl():
    redis = get_redis()
    key = "rl:concorrencia:identidade:/rota"

    counts = await asyncio.gather(*(increment_with_ttl(redis, key, 60) for _ in range(50)))

    assert sorted(counts) == list(range(1, 51))
    assert 0 < await redis.ttl(key) <= 60


class _BrokenRedis:
    async def eval(self, *args, **kwargs):
        raise RedisError("redis indisponivel")


async def test_falha_redis_e_fail_closed_na_autenticacao(monkeypatch):
    monkeypatch.setattr(rate_limit_module, "get_redis", lambda: _BrokenRedis())

    with pytest.raises(HTTPException) as raised:
        await enforce_rate_limit(
            _request("198.51.100.10"),
            bucket_key="rl:auth",
            identifier="198.51.100.10",
            limit=10,
            seconds=60,
            redis_failure="closed",
        )

    assert raised.value.status_code == 503


async def test_falha_redis_e_fail_open_no_ingest_autenticado(monkeypatch):
    monkeypatch.setattr(rate_limit_module, "get_redis", lambda: _BrokenRedis())

    await enforce_rate_limit(
        _request("198.51.100.10", path="/marketorders.ingest"),
        bucket_key="rl:ingest",
        identifier="api-token:00000000-0000-0000-0000-000000000001",
        limit=120,
        seconds=60,
        redis_failure="open",
    )


async def test_rota_de_registro_falha_fechada_sem_redis(client, monkeypatch):
    monkeypatch.setattr(rate_limit_module, "get_redis", lambda: _BrokenRedis())

    response = await client.post(
        "/auth/register",
        json={"email": "redis-down@example.com", "password": "senha123456"},
    )

    assert response.status_code == 503


async def test_rota_de_client_autenticada_falha_aberta_sem_redis(client, token_api, monkeypatch):
    monkeypatch.setattr(rate_limit_module, "get_redis", lambda: _BrokenRedis())

    response = await client.get("/client/me", headers={"Authorization": f"Bearer {token_api}"})

    assert response.status_code == 200, response.text
