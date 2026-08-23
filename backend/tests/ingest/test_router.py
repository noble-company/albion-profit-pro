"""
`.delay()` publica de verdade no RabbitMQ efêmero da sessão (task 20, ver
tests/conftest.py) — não há worker consumindo em processo separado durante os
testes, então a task fica na fila (não é executada aqui). Isso cobre só a
responsabilidade do router (task 16): validar payload, autenticar, responder
rápido. A execução da lógica de gravação é coberta por tests/ingest/test_tasks.py
(chamando as coroutines internas diretamente).
"""

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
    "MarketHistories": [{"ItemAmount": 10, "SilverAmount": 5000, "Timestamp": 1700000000}],
}

VALID_GOLD_PRICES_PAYLOAD = {"Prices": [2500, 2510], "Timestamps": [1700000000, 1700003600]}


async def test_ingest_market_orders_with_valid_token_returns_200(client, token_api):
    resp = await client.post(
        "/marketorders.ingest",
        headers={"Authorization": f"Bearer {token_api}"},
        json=VALID_MARKET_ORDERS_PAYLOAD,
    )
    assert resp.status_code == 200, resp.text


async def test_ingest_market_history_with_valid_token_returns_200(client, token_api):
    resp = await client.post(
        "/markethistories.ingest",
        headers={"Authorization": f"Bearer {token_api}"},
        json=VALID_MARKET_HISTORY_PAYLOAD,
    )
    assert resp.status_code == 200, resp.text


async def test_ingest_gold_prices_with_valid_token_returns_200(client, token_api):
    resp = await client.post(
        "/goldprices.ingest",
        headers={"Authorization": f"Bearer {token_api}"},
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
        headers={"Authorization": f"Bearer {token_api}"},
        json=malformed_payload,
    )
    assert resp.status_code == 422, resp.text


async def test_ingest_orders_over_max_length_returns_422(client, token_api):
    """Task 33, achado A6: lista sem teto derruba o broker — o schema rejeita antes de
    virar mensagem RabbitMQ."""
    huge_payload = {"Orders": [VALID_MARKET_ORDERS_PAYLOAD["Orders"][0]] * (MAX_ITENS_POR_LOTE + 1)}
    resp = await client.post(
        "/marketorders.ingest",
        headers={"Authorization": f"Bearer {token_api}"},
        json=huge_payload,
    )
    assert resp.status_code == 422, resp.text
