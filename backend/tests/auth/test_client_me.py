"""
Cobertura da task 04 (docs/tasks/client/) — `GET /client/me`.

Existe porque o client Go não tinha **nenhuma** forma de saber se o token dele presta antes
de ter dado pra mandar: o único sinal era um 401 perdido no `albiondata-client.log`. Junto
com o achado `N6` (o client descarta tudo até uma transição de zona), isso dava dois modos
de falha silenciosa com o mesmo sintoma — "não aparece nada no site" — impossíveis de
distinguir.
"""

from src.api_tokens.service import create_token
from tests.conftest import criar_usuario


async def test_client_me_com_token_valido_identifica_o_dono(client, usuario, token_api):
    resp = await client.get("/client/me", headers={"Authorization": f"Bearer {token_api}"})
    assert resp.status_code == 200, resp.text

    body = resp.json()
    assert body["user_id"] == str(usuario.id)
    assert body["email"] == usuario.email
    assert body["token_sufixo"] == token_api[-4:]


async def test_client_me_nunca_reexpoe_o_valor_do_token(client, token_api):
    """Mesma regra do `GET /auth/tokens` (task 32, achado A1): o endpoint identifica qual
    token é, sem devolver o segredo."""
    resp = await client.get("/client/me", headers={"Authorization": f"Bearer {token_api}"})
    assert resp.status_code == 200, resp.text
    assert token_api not in resp.text


async def test_client_me_sem_header_retorna_401(client):
    resp = await client.get("/client/me")
    assert resp.status_code == 401, resp.text


async def test_client_me_com_token_invalido_retorna_401(client):
    resp = await client.get("/client/me", headers={"Authorization": "Bearer apk_naoexiste"})
    assert resp.status_code == 401, resp.text


async def test_client_me_com_token_revogado_retorna_401(client, db_session, usuario):
    from src.api_tokens.service import revoke_token

    token = await create_token(db_session, usuario.id)
    cru = token.token

    resp = await client.get("/client/me", headers={"Authorization": f"Bearer {cru}"})
    assert resp.status_code == 200, resp.text  # antes de revogar, funciona

    await revoke_token(db_session, token.id, owner_id=usuario.id)

    resp = await client.get("/client/me", headers={"Authorization": f"Bearer {cru}"})
    assert resp.status_code == 401, resp.text


async def test_client_me_de_usuarios_diferentes_nao_se_misturam(client, db_session):
    """Cada token identifica o SEU dono — um token não pode devolver o e-mail de outro."""
    a = await criar_usuario(db_session)
    b = await criar_usuario(db_session)
    token_a = (await create_token(db_session, a.id)).token
    token_b = (await create_token(db_session, b.id)).token

    resp_a = await client.get("/client/me", headers={"Authorization": f"Bearer {token_a}"})
    resp_b = await client.get("/client/me", headers={"Authorization": f"Bearer {token_b}"})

    assert resp_a.json()["email"] == a.email
    assert resp_b.json()["email"] == b.email
    assert resp_a.json()["user_id"] != resp_b.json()["user_id"]


async def test_client_me_respeita_rate_limit(client, token_api):
    """30/min por token — o client chama isso uma vez por boot; o limite existe pra fechar
    a porta pra varredura de token, não pra limitar uso legítimo."""
    headers = {"Authorization": f"Bearer {token_api}"}
    statuses = [(await client.get("/client/me", headers=headers)).status_code for _ in range(31)]

    assert statuses.count(200) == 30
    assert statuses[-1] == 429
