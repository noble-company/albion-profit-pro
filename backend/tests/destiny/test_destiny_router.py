import pytest
from httpx import AsyncClient

from tests.conftest import registrar_e_logar

pytestmark = pytest.mark.asyncio


async def test_painel_comeca_vazio(cliente_autenticado: AsyncClient):
    """Sem painel preenchido, o jogador vê o custo de foco base — nenhum nó é inventado."""
    response = await cliente_autenticado.get("/me/destiny-board")

    assert response.status_code == 200
    assert response.json() == {"nodes": {}}


async def test_grava_e_le_de_volta(cliente_autenticado: AsyncClient):
    payload = {"nodes": {"refine:fiber:4": 100, "refine:fiber:5": 62}}

    put = await cliente_autenticado.put("/me/destiny-board", json=payload)
    assert put.status_code == 200

    get = await cliente_autenticado.get("/me/destiny-board")
    assert get.json() == payload


async def test_put_substitui_o_painel_inteiro(cliente_autenticado: AsyncClient):
    """A tela envia o painel completo, não um delta. Quem zera um nó espera que ele suma — um
    `PUT` que só somasse deixaria o nó velho influenciando a conta para sempre."""
    await cliente_autenticado.put(
        "/me/destiny-board", json={"nodes": {"refine:fiber:4": 100, "refine:ore:4": 50}}
    )

    await cliente_autenticado.put("/me/destiny-board", json={"nodes": {"refine:fiber:4": 80}})

    response = await cliente_autenticado.get("/me/destiny-board")
    assert response.json() == {"nodes": {"refine:fiber:4": 80}}


@pytest.mark.parametrize("level", [-1, 101])
async def test_nivel_fora_da_faixa_e_recusado(cliente_autenticado: AsyncClient, level: int):
    """O painel do jogo vai de 0 a 100. Aceitar 500 aqui viraria um custo de foco fantasia que
    o jogador não consegue reproduzir em lugar nenhum."""
    response = await cliente_autenticado.put(
        "/me/destiny-board", json={"nodes": {"refine:fiber:4": level}}
    )

    assert response.status_code == 422


async def test_painel_e_por_usuario(cliente_autenticado: AsyncClient, client: AsyncClient):
    """Painel é progressão de personagem. Vazar o de um usuário para outro daria a alguém um
    custo de foco que ele não conquistou."""
    await cliente_autenticado.put("/me/destiny-board", json={"nodes": {"refine:fiber:4": 100}})

    _, token = await registrar_e_logar(client)
    response = await client.get("/me/destiny-board", headers={"Authorization": f"Bearer {token}"})

    assert response.json() == {"nodes": {}}


async def test_exige_autenticacao(client: AsyncClient):
    assert (await client.get("/me/destiny-board")).status_code == 401
