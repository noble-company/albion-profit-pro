"""
Cada teste usa item_id único (uuid no nome do item) pra não colidir com dados
de outros testes que rodem no mesmo Postgres/Redis efêmeros da sessão (task 20).
`source_id` também precisa ser único entre testes desde a task 27 (agora tem constraint
única de verdade — antes não tinha).
"""

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from src.cache.redis_client import get_redis, set_book_depth
from src.database import async_session_maker
from src.ingest.service import save_market_orders
from src.items.service import upsert_locations
from src.prices.models import MarketOrder
from tests.conftest import registrar_e_logar


def _unique_item_id() -> str:
    return f"T2_TESTITEM_{uuid.uuid4().hex[:8]}"


def _unique_source_id() -> int:
    return uuid.uuid4().int % 1_000_000_000


def _order(item_id: str, auction_type: str, price, amount: int) -> MarketOrder:
    return MarketOrder(
        source_id=_unique_source_id(),
        item_id=item_id,
        group_type_id="",
        location_id="1002",
        quality_level=1,
        enchantment_level=0,
        unit_price_silver=price,
        amount=amount,
        auction_type=auction_type,
        # relativo a "agora", não uma data fixa — a task 29 passou a filtrar
        # `expires > now()` de verdade na profundidade do livro.
        expires=datetime.now(timezone.utc) + timedelta(days=30),
    )


def _match(body: dict, location_id: str = "1002", quality_level: int = 1) -> dict:
    matches = [
        p
        for p in body["prices"]
        if p["location_id"] == location_id and p["quality_level"] == quality_level
    ]
    assert len(matches) == 1, body["prices"]
    return matches[0]


async def test_scope_all_separates_venda_and_compra(client, db_session):
    """Prova o C3: venda e compra são universos de preço separados — nunca devem se
    misturar num preço só (a chave de cache antiga ignorava auction_type)."""
    item_id = _unique_item_id()
    _, requester_token = await registrar_e_logar(client)

    db_session.add(_order(item_id, "offer", 39, 20))
    db_session.add(_order(item_id, "request", 1, 5))
    # localização vem da tabela `location` desde a task 28 — sem essa linha o endpoint
    # não teria "1002" pra sequer olhar (preenchimento normalmente vem do ingest).
    await upsert_locations(db_session, {"1002"})
    await db_session.commit()

    resp = await client.get(
        f"/items/{item_id}/prices",
        params={"scope": "all"},
        headers={"Authorization": f"Bearer {requester_token}"},
    )
    assert resp.status_code == 200, resp.text
    match = _match(resp.json())
    assert Decimal(match["venda"]["preco"]) == Decimal("39")
    assert Decimal(match["compra"]["preco"]) == Decimal("1")  # nunca vaza pro campo de venda


async def test_scope_mine_empty_for_user_without_coverage_even_with_hot_cache(client, db_session):
    """C5 (task 29/30): `scope=mine` já pulava o cache, mas antes da task 30 não filtrava
    por procedência nenhuma. Prova que passar pelo ingest de verdade (que grava
    `market_scan`) de OUTRO usuário não vaza pro `scope=mine` de quem nunca varreu essa
    combinação — mesmo com o cache Redis quente pra ela."""
    item_id = _unique_item_id()
    owner_id, _ = await registrar_e_logar(client)
    _, requester_token = await registrar_e_logar(client)

    future_expires = (
        (datetime.now(timezone.utc) + timedelta(days=30)).replace(tzinfo=None).isoformat()
    )
    payload = {
        "orders": [
            {
                "id": _unique_source_id(),
                "item_id": item_id,
                "group_type_id": "",
                "location_id": "1002",
                "quality_level": 1,
                "enchantment_level": 0,
                "unit_price_silver": 2500000,
                "amount": 20,
                "auction_type": "offer",
                "expires": future_expires,
            }
        ]
    }
    # dono varre de verdade (via ingest): grava a ordem, a cobertura em market_scan E
    # aquece o cache Redis pra essa combinação — o cenário exato do furo do C5.
    await save_market_orders(async_session_maker, get_redis(), payload, str(owner_id))

    resp = await client.get(
        f"/items/{item_id}/prices",
        params={"scope": "mine"},
        headers={"Authorization": f"Bearer {requester_token}"},
    )
    assert resp.status_code == 200, resp.text
    matches = [
        p for p in resp.json()["prices"] if p["location_id"] == "1002" and p["quality_level"] == 1
    ]
    assert matches == []  # requester nunca varreu essa combinação


async def test_scope_mine_returns_data_for_user_with_coverage(client):
    """Mesmo cenário acima, mas consultado pelo próprio dono da varredura — `scope=mine`
    reflete o acervo global (mesmo valor de `scope=all`), só recortado pela cobertura dele."""
    item_id = _unique_item_id()
    owner_id, owner_token = await registrar_e_logar(client)

    future_expires = (
        (datetime.now(timezone.utc) + timedelta(days=30)).replace(tzinfo=None).isoformat()
    )
    payload = {
        "orders": [
            {
                "id": _unique_source_id(),
                "item_id": item_id,
                "group_type_id": "",
                "location_id": "1002",
                "quality_level": 1,
                "enchantment_level": 0,
                "unit_price_silver": 2500000,
                "amount": 20,
                "auction_type": "offer",
                "expires": future_expires,
            }
        ]
    }
    await save_market_orders(async_session_maker, get_redis(), payload, str(owner_id))

    resp = await client.get(
        f"/items/{item_id}/prices",
        params={"scope": "mine"},
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert resp.status_code == 200, resp.text
    match = _match(resp.json())
    assert Decimal(match["venda"]["preco"]) == Decimal("250")


async def test_scope_all_returns_data_from_any_collector(client):
    """Prova que o acervo é global: quem consulta `scope=all` vê o que QUALQUER outro
    usuário varreu, não só o que ele mesmo coletou."""
    item_id = _unique_item_id()
    owner_id, _ = await registrar_e_logar(client)
    _, requester_token = await registrar_e_logar(client)

    future_expires = (
        (datetime.now(timezone.utc) + timedelta(days=30)).replace(tzinfo=None).isoformat()
    )
    payload = {
        "orders": [
            {
                "id": _unique_source_id(),
                "item_id": item_id,
                "group_type_id": "",
                "location_id": "1002",
                "quality_level": 1,
                "enchantment_level": 0,
                "unit_price_silver": 2500000,
                "amount": 20,
                "auction_type": "offer",
                "expires": future_expires,
            }
        ]
    }
    await save_market_orders(async_session_maker, get_redis(), payload, str(owner_id))

    resp = await client.get(
        f"/items/{item_id}/prices",
        params={"scope": "all"},
        headers={"Authorization": f"Bearer {requester_token}"},
    )
    assert resp.status_code == 200, resp.text
    match = _match(resp.json())
    assert Decimal(match["venda"]["preco"]) == Decimal("250")


async def test_cache_hit_is_preferred_over_postgres_fallback(client, db_session):
    item_id = _unique_item_id()
    _, token = await registrar_e_logar(client)

    # grava um valor no Postgres (profundidade "antiga") e um valor diferente no cache Redis
    # pra mesma combinação (profundidade "atual") — a resposta deve refletir o cache, não o
    # Postgres, provando o cache-first.
    db_session.add(_order(item_id, "offer", 999, 1))  # não deve aparecer na resposta
    await upsert_locations(db_session, {"1002"})
    await db_session.commit()

    await set_book_depth(
        get_redis(),
        item_id,
        "1002",
        1,
        0,
        {
            "venda": {"preco": "111", "total_unidades": 7, "qtd_ordens": 1},
            "compra": {"preco": None, "total_unidades": 0, "qtd_ordens": 0},
            "vendido_24h": None,
            "varredura_em": None,
        },
    )

    resp = await client.get(
        f"/items/{item_id}/prices",
        params={"scope": "all"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200, resp.text
    match = _match(resp.json())
    assert Decimal(match["venda"]["preco"]) == Decimal(
        "111"
    )  # veio do cache, não do Postgres (999)
    assert match["venda"]["total_unidades"] == 7
    assert match["varredura_em"] is None  # cache não guardou varredura nesse teste
