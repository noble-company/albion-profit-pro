"""
`.delay()` publica de verdade no RabbitMQ efêmero da sessão (task 20, ver
tests/conftest.py) — não há worker consumindo em processo separado durante os
testes, então a task fica na fila (não é executada aqui). Isso cobre só a
responsabilidade do router (task 16): validar payload, autenticar, responder
rápido. A execução da lógica de gravação é coberta por tests/ingest/test_tasks.py
(chamando as coroutines internas diretamente).
"""

import json

import pytest
from structlog.testing import capture_logs

from src.api_tokens.service import get_valid_token
from src.ingest.schemas import MAX_ITENS_POR_LOTE

VALID_MARKET_ORDERS_PAYLOAD = {
    "Orders": [
        {
            "Id": 1,
            "ItemTypeId": "T2_FIBER",
            "ItemGroupTypeId": "",
            "LocationId": "1002",
            "QualityLevel": 1,
            "EnchantmentLevel": 0,
            "UnitPriceSilver": 100,
            "Amount": 50,
            "AuctionType": "offer",
            "Expires": "2026-08-22T00:00:00",
        }
    ]
}

VALID_MARKET_HISTORY_PAYLOAD = {
    "AlbionId": 1234,
    "LocationId": "3005",
    "QualityLevel": 4,
    "Timescale": 1,
    "MarketHistories": [{"ItemAmount": 10, "SilverAmount": 5000, "Timestamp": 639229968000000000}],
}

VALID_GOLD_PRICES_PAYLOAD = {"Prices": [2500, 2510], "Timestamps": [1700000000, 1700003600]}


async def test_ingest_market_orders_with_valid_token_returns_200(client, token_api):
    resp = await client.post(
        "/marketorders.ingest",
        headers={"Authorization": f"Bearer {token_api}", "X-Albion-Server": "west"},
        json=VALID_MARKET_ORDERS_PAYLOAD,
    )
    assert resp.status_code == 200, resp.text


async def test_ingest_requires_valid_albion_server(client, token_api):
    headers = {"Authorization": f"Bearer {token_api}"}
    missing = await client.post(
        "/marketorders.ingest", headers=headers, json=VALID_MARKET_ORDERS_PAYLOAD
    )
    invalid = await client.post(
        "/marketorders.ingest",
        headers={**headers, "X-Albion-Server": "americas"},
        json=VALID_MARKET_ORDERS_PAYLOAD,
    )
    assert missing.status_code == 422
    assert invalid.status_code == 422


async def test_ingest_enqueues_non_secret_token_id_for_failure_context(
    client, token_api, db_session, monkeypatch
):
    captured = {}

    def capture_delay(payload, **kwargs):
        captured["payload"] = payload
        captured["kwargs"] = kwargs

    monkeypatch.setattr("src.ingest.router.process_market_orders.delay", capture_delay)
    token_row = await get_valid_token(db_session, token_api)

    resp = await client.post(
        "/marketorders.ingest",
        headers={"Authorization": f"Bearer {token_api}", "X-Albion-Server": "west"},
        json=VALID_MARKET_ORDERS_PAYLOAD,
    )

    assert resp.status_code == 200, resp.text
    assert captured["kwargs"]["api_token_id"] == str(token_row.id)
    assert captured["kwargs"]["user_id"] == str(token_row.user_id)
    assert captured["kwargs"]["realm"] == "west"
    assert token_api not in json.dumps(captured)


async def test_ingest_market_history_with_valid_token_returns_200(client, token_api):
    resp = await client.post(
        "/markethistories.ingest",
        headers={"Authorization": f"Bearer {token_api}", "X-Albion-Server": "west"},
        json=VALID_MARKET_HISTORY_PAYLOAD,
    )
    assert resp.status_code == 200, resp.text


async def test_ingest_gold_prices_with_valid_token_returns_200(client, token_api):
    resp = await client.post(
        "/goldprices.ingest",
        headers={"Authorization": f"Bearer {token_api}", "X-Albion-Server": "west"},
        json=VALID_GOLD_PRICES_PAYLOAD,
    )
    assert resp.status_code == 200, resp.text


async def test_ingest_without_authorization_header_returns_401(client):
    resp = await client.post("/marketorders.ingest", json=VALID_MARKET_ORDERS_PAYLOAD)
    assert resp.status_code == 401, resp.text


async def test_ingest_with_malformed_payload_returns_422(client, token_api):
    malformed_payload = {
        "Orders": [
            {
                "Id": 1,
                "ItemTypeId": "T2_FIBER",
                "ItemGroupTypeId": "",
                "LocationId": "1002",
                "QualityLevel": "not-a-number",
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
        json=malformed_payload,
    )
    assert resp.status_code == 422, resp.text


@pytest.mark.parametrize(
    ("path", "task_path", "payload"),
    [
        (
            "/marketorders.ingest",
            "src.ingest.router.process_market_orders.delay",
            {"Orders": [{**VALID_MARKET_ORDERS_PAYLOAD["Orders"][0], "AuctionType": "sell"}]},
        ),
        (
            "/markethistories.ingest",
            "src.ingest.router.process_market_history.delay",
            {
                **VALID_MARKET_HISTORY_PAYLOAD,
                "MarketHistories": [
                    {"ItemAmount": 10, "SilverAmount": 5000, "Timestamp": 1700000000}
                ],
            },
        ),
        (
            "/goldprices.ingest",
            "src.ingest.router.process_gold_prices.delay",
            {"Prices": [2500], "Timestamps": []},
        ),
    ],
)
async def test_invalid_payload_never_reaches_celery(
    client, token_api, monkeypatch, path, task_path, payload
):
    def forbidden_delay(*args, **kwargs):
        pytest.fail("payload inválido não pode publicar no RabbitMQ")

    monkeypatch.setattr(task_path, forbidden_delay)
    resp = await client.post(
        path,
        headers={"Authorization": f"Bearer {token_api}", "X-Albion-Server": "west"},
        json=payload,
    )
    assert resp.status_code == 422, resp.text


async def test_validation_log_and_response_do_not_include_rejected_secret(
    client, token_api, monkeypatch
):
    secret = "apk_" + "super-secret-value" * 10
    payload = {"Orders": [{**VALID_MARKET_ORDERS_PAYLOAD["Orders"][0], "ItemTypeId": secret}]}
    monkeypatch.setattr(
        "src.ingest.router.process_market_orders.delay",
        lambda *args, **kwargs: pytest.fail("payload inválido não pode ser publicado"),
    )

    with capture_logs() as logs:
        resp = await client.post(
            "/marketorders.ingest",
            headers={"Authorization": f"Bearer {token_api}", "X-Albion-Server": "west"},
            json=payload,
        )

    assert resp.status_code == 422
    assert secret not in resp.text
    assert secret not in json.dumps(logs)
    assert logs[-1]["event"] == "ingest.payload_rejeitado"
    assert set(logs[-1]["errors"][0]) == {"loc", "type", "msg"}


async def test_ingest_orders_over_max_length_returns_422(client, token_api):
    """Task 33, achado A6: lista sem teto derruba o broker — o schema rejeita antes de
    virar mensagem RabbitMQ."""
    huge_payload = {"Orders": [VALID_MARKET_ORDERS_PAYLOAD["Orders"][0]] * (MAX_ITENS_POR_LOTE + 1)}
    resp = await client.post(
        "/marketorders.ingest",
        headers={"Authorization": f"Bearer {token_api}", "X-Albion-Server": "west"},
        json=huge_payload,
    )
    assert resp.status_code == 422, resp.text
