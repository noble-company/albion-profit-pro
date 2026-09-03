"""S02: the expensive read endpoints are rate limited per authenticated user."""

from sqlalchemy import event

from src.cache.redis_client import get_redis
from src.database import engine
from tests.conftest import registrar_e_logar

BUCKET = "rl:opportunities"
LIMIT = 60
PATH = "/opportunities/flips"


def _key(user_id) -> str:
    return f"{BUCKET}:user:{user_id}:{PATH}"


async def test_flips_returns_429_and_skips_the_query_when_over_the_limit(client, db_session):
    user_id, token = await registrar_e_logar(client)
    headers = {"Authorization": f"Bearer {token}"}

    # Park the counter one below the limit; the next request tips it over.
    await get_redis().set(_key(user_id), LIMIT, ex=60)

    statements: list[str] = []

    def _rec(conn, cursor, statement, parameters, context, executemany):
        statements.append(statement)

    event.listen(engine.sync_engine, "before_cursor_execute", _rec)
    try:
        resp = await client.get(PATH, params={"server": "west"}, headers=headers)
    finally:
        event.remove(engine.sync_engine, "before_cursor_execute", _rec)

    assert resp.status_code == 429, resp.text
    assert "opportunities" not in resp.json()
    assert not any("flip_candidates" in s for s in statements)


async def test_buckets_are_per_user(client):
    blocked_id, blocked_token = await registrar_e_logar(client)
    _, free_token = await registrar_e_logar(client)
    await get_redis().set(_key(blocked_id), LIMIT, ex=60)

    blocked = await client.get(
        PATH, params={"server": "west"}, headers={"Authorization": f"Bearer {blocked_token}"}
    )
    free = await client.get(
        PATH, params={"server": "west"}, headers={"Authorization": f"Bearer {free_token}"}
    )
    assert blocked.status_code == 429
    assert free.status_code == 200


async def test_rate_limit_key_has_ttl(client):
    user_id, token = await registrar_e_logar(client)
    resp = await client.get(
        PATH, params={"server": "west"}, headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200
    ttl = await get_redis().ttl(_key(user_id))
    assert 0 < ttl <= 60


async def test_unauthenticated_request_is_rejected_before_the_rate_limit(client):
    # Auth runs first: an anonymous caller gets 401, never a 429.
    resp = await client.get(PATH, params={"server": "west"})
    assert resp.status_code == 401
