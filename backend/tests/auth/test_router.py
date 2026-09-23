import uuid

from fastapi import HTTPException

from src.api_tokens.dependencies import require_api_token
from src.database import async_session_maker
from tests.conftest import registrar_e_logar, unique_email


async def test_full_auth_and_token_flow(client):
    email = unique_email()

    # registro
    resp = await client.post("/auth/register", json={"email": email, "password": "senha123456"})
    assert resp.status_code == 201, resp.text

    # login
    resp = await client.post("/auth/login", data={"username": email, "password": "senha123456"})
    assert resp.status_code == 200, resp.text
    access_token = resp.json()["access_token"]
    auth_header = {"Authorization": f"Bearer {access_token}"}

    # criar token de API
    resp = await client.post("/auth/tokens", headers=auth_header)
    assert resp.status_code == 201, resp.text
    token_body = resp.json()
    assert token_body["token"].startswith("apk_")
    token_id = token_body["id"]
    raw_token = token_body["token"]

    # listar tokens — não deve reexpor o valor
    resp = await client.get("/auth/tokens", headers=auth_header)
    assert resp.status_code == 200, resp.text
    listed = resp.json()
    assert len(listed) == 1
    assert "token" not in listed[0]
    assert listed[0]["id"] == token_id
    assert listed[0]["revoked_at"] is None

    # o token recém-criado precisa passar em require_api_token
    async with async_session_maker() as session:
        result = await require_api_token(authorization=f"Bearer {raw_token}", session=session)
        assert str(result.id) == token_id

    # revogar
    resp = await client.delete(f"/auth/tokens/{token_id}", headers=auth_header)
    assert resp.status_code == 204, resp.text

    # depois de revogado, require_api_token deve rejeitar
    async with async_session_maker() as session:
        raised = False
        try:
            await require_api_token(authorization=f"Bearer {raw_token}", session=session)
        except HTTPException as e:
            raised = True
            assert e.status_code == 401
        assert raised

    # revogar de novo o mesmo token -> idempotente, continua 204
    # (revoke_token não distingue "já revogado" de "revogado agora";
    # 404 fica reservado pra token que não existe/não pertence ao usuário)
    resp = await client.delete(f"/auth/tokens/{token_id}", headers=auth_header)
    assert resp.status_code == 204, resp.text

    # revogar um token que não existe -> 404 de verdade
    resp = await client.delete(f"/auth/tokens/{uuid.uuid4()}", headers=auth_header)
    assert resp.status_code == 404, resp.text


async def test_api_token_cap_per_user(client):
    """S05: um usuário não gera tokens indefinidamente. O teto devolve erro claro e os
    tokens que ele já tem seguem válidos."""
    from src.api_tokens.service import MAX_ACTIVE_TOKENS_PER_USER

    _, access_token = await registrar_e_logar(client)
    headers = {"Authorization": f"Bearer {access_token}"}

    created_ids = []
    for _ in range(MAX_ACTIVE_TOKENS_PER_USER):
        resp = await client.post("/auth/tokens", headers=headers)
        assert resp.status_code == 201, resp.text
        created_ids.append(resp.json()["id"])

    over = await client.post("/auth/tokens", headers=headers)
    assert over.status_code == 409
    assert "Revoke" in over.json()["detail"]

    # Os tokens existentes continuam listados e ativos.
    listed = (await client.get("/auth/tokens", headers=headers)).json()
    assert len(listed) == MAX_ACTIVE_TOKENS_PER_USER
    assert all(row["revoked_at"] is None for row in listed)

    # Revogar um libera espaço para criar outro.
    assert (
        await client.delete(f"/auth/tokens/{created_ids[0]}", headers=headers)
    ).status_code == 204
    again = await client.post("/auth/tokens", headers=headers)
    assert again.status_code == 201, again.text


async def test_register_rate_limit_returns_429_after_the_limit(client):
    """Task 33, achado A6: `/auth/register` é 10/min por IP — a 11ª tentativa na mesma
    janela deve ser rejeitada, não só logada."""
    statuses = []
    for _ in range(11):
        resp = await client.post(
            "/auth/register",
            json={"email": unique_email(), "password": "senha123456"},
        )
        statuses.append(resp.status_code)

    assert statuses.count(201) == 10  # exatamente o limite
    assert statuses[-1] == 429


async def test_swagger_docs_available(client):
    resp = await client.get("/docs")
    assert resp.status_code == 200
    resp = await client.get("/openapi.json")
    assert resp.status_code == 200
    paths = resp.json()["paths"]
    assert "/auth/register" in paths
    assert "/auth/login" in paths
    assert "/auth/tokens" in paths
    assert "/auth/tokens/{token_id}" in paths
