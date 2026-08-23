"""
Cada teste usa item_id único (uuid no nome do item) pra não colidir com dados
de outros testes que rodem no mesmo Postgres/Redis efêmeros da sessão (task 20).
`source_id` também precisa ser único entre testes desde a task 27 (agora tem constraint
única de verdade — antes não tinha).
"""

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import delete

from src.cache.redis_client import get_redis, set_book_depth
from src.database import async_session_maker
from src.ingest.normalize import TICKS_PER_SECOND, TICKS_UNIX_EPOCH
from src.ingest.service import save_market_history, save_market_orders
from src.items.models import Item
from src.items.service import upsert_locations
from src.prices.models import MarketOrder
from tests.conftest import registrar_e_logar


def _unique_item_id() -> str:
    return f"T2_TESTITEM_{uuid.uuid4().hex[:8]}"


def _unique_source_id() -> int:
    return uuid.uuid4().int % 1_000_000_000


def _unique_albion_id() -> int:
    return 900_000 + (uuid.uuid4().int % 99_999)


def _order(item_id: str, auction_type: str, price, amount: int) -> MarketOrder:
    return MarketOrder(
        server_id="west",
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


def _match(
    body: dict,
    location_id: str = "1002",
    quality_level: int = 1,
    enchantment_level: int = 0,
) -> dict:
    matches = [
        p
        for p in body["prices"]
        if p["location_id"] == location_id
        and p["quality_level"] == quality_level
        and p["enchantment_level"] == enchantment_level
    ]
    assert len(matches) == 1, body["prices"]
    return matches[0]


def _orders_payload(item_id: str) -> dict:
    future_expires = (
        (datetime.now(timezone.utc) + timedelta(days=30)).replace(tzinfo=None).isoformat()
    )
    return {
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


def _history_payload(albion_id: int) -> dict:
    bucket_start = datetime.now(timezone.utc) - timedelta(hours=1)
    ticks = int(bucket_start.timestamp()) * TICKS_PER_SECOND + TICKS_UNIX_EPOCH
    return {
        "albion_id": albion_id,
        "location_id": "1002",
        "quality_level": 1,
        "timescale": 0,
        "histories": [
            {
                "timestamp": ticks,
                "item_amount": 10,
                "silver_amount": 1_000_000,
            }
        ],
    }


async def _add_item(db_session, item_id: str, albion_id: int) -> None:
    db_session.add(Item(unique_name=item_id, albion_id=albion_id))
    await db_session.commit()


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
        params={"server": "west", "scope": "all"},
        headers={"Authorization": f"Bearer {requester_token}"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["server"] == "west"
    match = _match(resp.json())
    assert Decimal(match["venda"]["melhor_preco"]) == Decimal("39")
    assert Decimal(match["compra"]["melhor_preco"]) == Decimal("1")
    assert match["cobertura"] == "parcial"
    assert match["janela_frescor_segundos"] == 6 * 60 * 60
    assert match["venda"]["observado_em"] is not None
    assert match["venda"]["idade_segundos"] >= 0


async def test_prices_requires_canonical_server(client):
    item_id = _unique_item_id()
    _, token = await registrar_e_logar(client)
    headers = {"Authorization": f"Bearer {token}"}

    missing = await client.get(f"/items/{item_id}/prices", headers=headers)
    invalid = await client.get(
        f"/items/{item_id}/prices", params={"server": "americas"}, headers=headers
    )

    assert missing.status_code == 422
    assert invalid.status_code == 422


async def test_prices_paginates_and_filters_only_observed_combinations(client, db_session):
    item_id = _unique_item_id()
    _, token = await registrar_e_logar(client)
    first = _order(item_id, "offer", 39, 20)
    second = _order(item_id, "offer", 41, 10)
    second.location_id = "2002"
    db_session.add_all([first, second])
    await db_session.commit()
    headers = {"Authorization": f"Bearer {token}"}

    first_page = await client.get(
        f"/items/{item_id}/prices",
        params={"server": "west", "limit": 1},
        headers=headers,
    )
    assert first_page.status_code == 200, first_page.text
    assert first_page.json()["total"] == 2
    assert first_page.json()["limit"] == 1
    assert first_page.json()["offset"] == 0
    assert len(first_page.json()["prices"]) == 1

    filtered = await client.get(
        f"/items/{item_id}/prices",
        params=[("server", "west"), ("location_id", "2002")],
        headers=headers,
    )
    assert filtered.status_code == 200, filtered.text
    assert filtered.json()["total"] == 1
    assert filtered.json()["prices"][0]["location_id"] == "2002"


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
    await save_market_orders(async_session_maker, get_redis(), payload, "west", str(owner_id))

    resp = await client.get(
        f"/items/{item_id}/prices",
        params={"server": "west", "scope": "mine"},
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
    await save_market_orders(async_session_maker, get_redis(), payload, "west", str(owner_id))

    resp = await client.get(
        f"/items/{item_id}/prices",
        params={"server": "west", "scope": "mine"},
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert resp.status_code == 200, resp.text
    match = _match(resp.json())
    assert Decimal(match["venda"]["melhor_preco"]) == Decimal("250")


async def test_scope_mine_history_scan_does_not_grant_book_coverage(client, db_session):
    item_id = _unique_item_id()
    albion_id = _unique_albion_id()
    history_owner_id, history_owner_token = await registrar_e_logar(client)
    book_owner_id, _ = await registrar_e_logar(client)
    await _add_item(db_session, item_id, albion_id)

    await save_market_history(
        async_session_maker,
        get_redis(),
        _history_payload(albion_id),
        "west",
        str(history_owner_id),
    )
    await save_market_orders(
        async_session_maker, get_redis(), _orders_payload(item_id), "west", str(book_owner_id)
    )

    resp = await client.get(
        f"/items/{item_id}/prices",
        params={"server": "west", "scope": "mine"},
        headers={"Authorization": f"Bearer {history_owner_token}"},
    )
    assert resp.status_code == 200, resp.text
    match = _match(resp.json())
    assert match["venda"] == {
        "melhor_preco": None,
        "unidades_observadas": 0,
        "ordens_observadas": 0,
        "observado_em": None,
        "idade_segundos": None,
    }
    assert match["vendido_24h"]["unidades"] == 10
    assert Decimal(match["vendido_24h"]["preco_medio"]) == Decimal("10")


async def test_scope_mine_book_scan_does_not_grant_history_coverage(client, db_session):
    item_id = _unique_item_id()
    albion_id = _unique_albion_id()
    book_owner_id, book_owner_token = await registrar_e_logar(client)
    history_owner_id, _ = await registrar_e_logar(client)
    await _add_item(db_session, item_id, albion_id)

    await save_market_orders(
        async_session_maker, get_redis(), _orders_payload(item_id), "west", str(book_owner_id)
    )
    await save_market_history(
        async_session_maker,
        get_redis(),
        _history_payload(albion_id),
        "west",
        str(history_owner_id),
    )

    resp = await client.get(
        f"/items/{item_id}/prices",
        params={"server": "west", "scope": "mine"},
        headers={"Authorization": f"Bearer {book_owner_token}"},
    )
    assert resp.status_code == 200, resp.text
    match = _match(resp.json())
    assert Decimal(match["venda"]["melhor_preco"]) == Decimal("250")
    assert match["vendido_24h"] is None


async def test_scope_mine_combines_sources_only_for_their_collector(client, db_session):
    item_id = _unique_item_id()
    albion_id = _unique_albion_id()
    owner_id, owner_token = await registrar_e_logar(client)
    _, outsider_token = await registrar_e_logar(client)
    await _add_item(db_session, item_id, albion_id)

    await save_market_orders(
        async_session_maker, get_redis(), _orders_payload(item_id), "west", str(owner_id)
    )
    await save_market_history(
        async_session_maker, get_redis(), _history_payload(albion_id), "west", str(owner_id)
    )

    owner_resp = await client.get(
        f"/items/{item_id}/prices",
        params={"server": "west", "scope": "mine"},
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert owner_resp.status_code == 200, owner_resp.text
    owner_match = _match(owner_resp.json())
    assert Decimal(owner_match["venda"]["melhor_preco"]) == Decimal("250")
    assert owner_match["vendido_24h"]["unidades"] == 10

    outsider_resp = await client.get(
        f"/items/{item_id}/prices",
        params={"server": "west", "scope": "mine"},
        headers={"Authorization": f"Bearer {outsider_token}"},
    )
    assert outsider_resp.status_code == 200, outsider_resp.text
    outsider_matches = [
        price
        for price in outsider_resp.json()["prices"]
        if price["location_id"] == "1002" and price["quality_level"] == 1
    ]
    assert outsider_matches == []


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
    await save_market_orders(async_session_maker, get_redis(), payload, "west", str(owner_id))

    resp = await client.get(
        f"/items/{item_id}/prices",
        params={"server": "west", "scope": "all"},
        headers={"Authorization": f"Bearer {requester_token}"},
    )
    assert resp.status_code == 200, resp.text
    match = _match(resp.json())
    assert Decimal(match["venda"]["melhor_preco"]) == Decimal("250")


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
        "west",
        item_id,
        "1002",
        1,
        0,
        {
            "venda": {
                "melhor_preco": "111",
                "unidades_observadas": 7,
                "ordens_observadas": 1,
                "observado_em": None,
                "idade_segundos": None,
            },
            "compra": {
                "melhor_preco": None,
                "unidades_observadas": 0,
                "ordens_observadas": 0,
                "observado_em": None,
                "idade_segundos": None,
            },
            "vendido_24h": None,
            "cobertura": "parcial",
            "janela_frescor_segundos": 6 * 60 * 60,
            "fontes": {"livro": True, "historico": False},
            "atualizado_em": datetime.now(timezone.utc).isoformat(),
        },
    )

    resp = await client.get(
        f"/items/{item_id}/prices",
        params={"server": "west", "scope": "all"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200, resp.text
    match = _match(resp.json())
    assert Decimal(match["venda"]["melhor_preco"]) == Decimal(
        "111"
    )  # veio do cache, não do Postgres (999)
    assert match["venda"]["unidades_observadas"] == 7


async def test_orphaned_cache_entry_is_not_returned_without_database_combination(client):
    item_id = _unique_item_id()
    _, token = await registrar_e_logar(client)
    await set_book_depth(
        get_redis(),
        "west",
        item_id,
        "1002",
        1,
        0,
        {
            "venda": {
                "melhor_preco": "999",
                "unidades_observadas": 1,
                "ordens_observadas": 1,
                "observado_em": datetime.now(timezone.utc).isoformat(),
                "idade_segundos": 0,
            },
            "compra": {
                "melhor_preco": None,
                "unidades_observadas": 0,
                "ordens_observadas": 0,
                "observado_em": None,
                "idade_segundos": None,
            },
            "vendido_24h": None,
            "cobertura": "parcial",
            "janela_frescor_segundos": 6 * 60 * 60,
            "fontes": {"livro": True, "historico": False},
            "atualizado_em": datetime.now(timezone.utc).isoformat(),
        },
    )

    resp = await client.get(
        f"/items/{item_id}/prices",
        params={"server": "west"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["total"] == 0
    assert resp.json()["prices"] == []


async def test_cache_is_recomputed_when_book_source_disappears_but_history_remains(
    client, db_session
):
    item_id = _unique_item_id()
    albion_id = _unique_albion_id()
    owner_id, token = await registrar_e_logar(client)
    await _add_item(db_session, item_id, albion_id)
    await save_market_orders(
        async_session_maker, get_redis(), _orders_payload(item_id), "west", str(owner_id)
    )
    await save_market_history(
        async_session_maker,
        get_redis(),
        _history_payload(albion_id),
        "west",
        str(owner_id),
    )
    await db_session.execute(delete(MarketOrder).where(MarketOrder.item_id == item_id))
    await db_session.commit()

    resp = await client.get(
        f"/items/{item_id}/prices",
        params={"server": "west"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200, resp.text
    match = _match(resp.json())
    assert match["venda"]["melhor_preco"] is None
    assert match["vendido_24h"]["unidades"] == 10
