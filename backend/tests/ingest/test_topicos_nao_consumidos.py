"""
Cobertura da task 04 (docs/tasks/client/) — os 3 tópicos públicos que o client publica e
nós não consumimos (`mapdata`, `banditevent`, `festivities`, achado `F5`).

Sem estas rotas eles davam 404 a cada evento e poluíam o `albiondata-client.log` do
usuário. Confirmado ao vivo em 2026-08-23: `mapdata.ingest` chegou numa sessão normal de
jogo, sem nenhuma ação especial — o payload real está versionado em
`tests/fixtures/wire/mapdata-real-5003.json` e é usado aqui.
"""

import json
from pathlib import Path

import pytest
from sqlalchemy import func, select

from src.prices.models import MarketHistoryEntry, MarketOrder

TOPICOS = ["mapdata", "banditevent", "festivities"]

FIXTURE_MAPDATA = (
    Path(__file__).resolve().parent.parent / "fixtures" / "wire" / "mapdata-real-5003.json"
)


@pytest.mark.parametrize("topico", TOPICOS)
async def test_topico_nao_consumido_responde_200(client, token_api, topico):
    resp = await client.post(
        f"/{topico}.ingest",
        headers={"Authorization": f"Bearer {token_api}", "X-Albion-Server": "west"},
        json={"qualquer": "coisa"},
    )
    assert resp.status_code == 200, resp.text


async def test_mapdata_real_do_jogo_e_aceito(client, token_api):
    """Payload de verdade capturado do jogo, não um dict inventado — é o mesmo princípio
    que a task 36 do backend estabeleceu."""
    payload = json.loads(FIXTURE_MAPDATA.read_text())
    resp = await client.post(
        "/mapdata.ingest",
        headers={"Authorization": f"Bearer {token_api}", "X-Albion-Server": "west"},
        json=payload,
    )
    assert resp.status_code == 200, resp.text


@pytest.mark.parametrize("topico", TOPICOS)
async def test_topico_nao_consumido_exige_autenticacao(client, topico):
    resp = await client.post(f"/{topico}.ingest", json={})
    assert resp.status_code == 401, resp.text


@pytest.mark.parametrize("topico", TOPICOS)
async def test_topico_nao_consumido_nao_grava_nada(client, token_api, db_session, topico):
    antes_ordens = await db_session.scalar(select(func.count()).select_from(MarketOrder))
    antes_hist = await db_session.scalar(select(func.count()).select_from(MarketHistoryEntry))

    resp = await client.post(
        f"/{topico}.ingest",
        headers={"Authorization": f"Bearer {token_api}", "X-Albion-Server": "west"},
        json={"Orders": [{"Id": 1}], "ZoneID": 5003},
    )
    assert resp.status_code == 200, resp.text

    assert await db_session.scalar(select(func.count()).select_from(MarketOrder)) == antes_ordens
    assert (
        await db_session.scalar(select(func.count()).select_from(MarketHistoryEntry)) == antes_hist
    )


async def test_topico_desconhecido_continua_404(client, token_api):
    """A regressão que mataria isso é trocar as 3 rotas explícitas por uma curinga
    `/{topico}.ingest`: um erro de digitação do client viraria 200 silencioso em vez de
    404, e a gente perderia o sinal de que ele está mandando coisa que não existe."""
    resp = await client.post(
        "/naoexiste.ingest",
        headers={"Authorization": f"Bearer {token_api}", "X-Albion-Server": "west"},
        json={},
    )
    assert resp.status_code == 404, resp.text


async def test_topicos_consumidos_continuam_roteando_para_o_handler_certo(client, token_api):
    """Regressão de ordem de registro: se uma rota curinga capturasse `/marketorders.ingest`,
    o payload seria descartado em silêncio e o teste acima ainda passaria. Este é o que
    pega."""
    payload = {
        "Orders": [
            {
                "Id": 1,
                "ItemTypeId": "T2_FIBER",
                "ItemGroupTypeId": "",
                "LocationId": "1002",
                "QualityLevel": "not-a-number",  # inválido de propósito
                "EnchantmentLevel": 0,
                "UnitPriceSilver": 100,
                "Amount": 50,
                "AuctionType": "offer",
                "Expires": "2026-08-22T00:00:00",
            }
        ]
    }
    resp = await client.post(
        "/marketorders.ingest",
        headers={"Authorization": f"Bearer {token_api}", "X-Albion-Server": "west"},
        json=payload,
    )
    # 422 prova que o schema de marketorders foi aplicado — ou seja, a rota certa respondeu.
    # Se um curinga tivesse capturado, viria 200 (ele nem lê o corpo).
    assert resp.status_code == 422, resp.text
