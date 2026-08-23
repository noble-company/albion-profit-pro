async def test_health_always_returns_ok(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


async def test_ready_returns_ok_when_dependencies_are_up(client):
    resp = await client.get("/ready")
    assert resp.status_code == 200
    body = resp.json()
    assert body["postgres"] == "ok"
    assert body["redis"] == "ok"


async def test_ready_returns_503_without_leaking_dsn_when_postgres_fails(client, monkeypatch):
    """Task 33, achado A3: `/ready` não é autenticado — o detalhe da exceção (host,
    usuário, nome do banco) não pode vazar no corpo da resposta."""
    import src.main as main_module
    from src.config import get_settings

    settings = get_settings()

    def _broken_session_maker():
        raise RuntimeError(f"connection refused: {settings.database_url}")

    monkeypatch.setattr(main_module, "async_session_maker", _broken_session_maker)

    resp = await client.get("/ready")
    assert resp.status_code == 503
    body = resp.json()
    assert body["postgres"] == "erro"
    assert settings.database_url not in resp.text
    assert "connection refused" not in resp.text


async def test_ready_returns_503_without_leaking_details_when_redis_fails(client, monkeypatch):
    import src.main as main_module

    class _BrokenRedis:
        async def ping(self):
            raise ConnectionError("redis://usuario:segredo@host-interno:6379/0 unreachable")

    monkeypatch.setattr(main_module, "get_redis", lambda: _BrokenRedis())

    resp = await client.get("/ready")
    assert resp.status_code == 503
    body = resp.json()
    assert body["redis"] == "erro"
    assert body["postgres"] == "ok"
    assert "segredo" not in resp.text


async def test_cors_preflight_allows_configured_origin_not_unknown_origin(client):
    """Task 33, achado A2: `settings.cors_origins` default é `http://localhost:5173`
    (ver tests/conftest.py) — a origem configurada recebe o cabeçalho, uma estranha não."""
    resp = await client.options(
        "/health",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert resp.headers.get("access-control-allow-origin") == "http://localhost:5173"

    resp = await client.options(
        "/health",
        headers={
            "Origin": "http://site-estranho.example.com",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert resp.headers.get("access-control-allow-origin") != "http://site-estranho.example.com"
