"""
Cobertura da task 27 — `market_order` como estado atual do livro, deduplicado por `source_id`
(o `Id` do leilão, estável entre varreduras). Corrige o achado C2: o client reenvia o livro
inteiro a cada varredura, e sem upsert a tabela crescia sem limite com cópias da mesma oferta.

Desvio da spec: a spec pede enviar os 4 payloads reais da captura original (50/47/47/50
ordens, com Ids repetidos entre #1↔#4 e #2↔#3) e afirmar `count(*) == 97` (97 ordens reais
medidas, não 194). Só existe um fixture versionado
(`marketorders-real-t2fiber.json`, 50 ordens) — os 4 payloads brutos da captura não foram
salvos como arquivos separados. Provamos a mesma propriedade (C2 corrigido) enviando esse
fixture real duas vezes seguidas — é a versão com os dados que realmente temos do mesmo teste
que a seção "Testes manuais" da spec já descreve.
"""

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func, select

from src.cache.redis_client import get_redis
from src.database import async_session_maker
from src.ingest.schemas import MarketUploadIn
from src.ingest.service import save_market_orders
from src.prices.models import MarketOrder


def _dump(payload_ordens_real: dict) -> dict:
    return MarketUploadIn.model_validate(payload_ordens_real).model_dump(by_alias=False)


async def test_resending_the_same_scan_does_not_duplicate(payload_ordens_real, db_session):
    """Prova o C2: enviar o mesmo lote de 50 ordens reais duas vezes seguidas (o client reenvia
    o livro inteiro a cada varredura) grava 50 linhas, não 100."""
    payload = _dump(payload_ordens_real)
    source_ids = [o["id"] for o in payload["orders"]]

    await save_market_orders(async_session_maker, get_redis(), payload, "west")
    await save_market_orders(async_session_maker, get_redis(), payload, "west")

    count = await db_session.scalar(
        select(func.count()).select_from(MarketOrder).where(MarketOrder.source_id.in_(source_ids))
    )
    distinct_source_ids = await db_session.scalar(
        select(func.count(func.distinct(MarketOrder.source_id))).where(
            MarketOrder.source_id.in_(source_ids)
        )
    )
    assert count == len(source_ids)  # 50, não 100
    assert count == distinct_source_ids


async def test_upsert_updates_price_and_amount_for_same_source_id(db_session):
    first = {
        "orders": [
            {
                "id": 424242,
                "item_id": "T2_FIBER",
                "group_type_id": "",
                "location_id": "1002",
                "quality_level": 1,
                "enchantment_level": 0,
                "unit_price_silver": 1000000,  # 100 silver real
                "amount": 50,
                "auction_type": "offer",
                "expires": "2026-08-22T00:00:00",
            }
        ]
    }
    second = {
        "orders": [
            {
                **first["orders"][0],
                "unit_price_silver": 500000,  # 50 silver real — preço mudou
                "amount": 12,  # quantidade mudou
            }
        ]
    }

    await save_market_orders(async_session_maker, get_redis(), first, "west")
    await save_market_orders(async_session_maker, get_redis(), second, "west")

    result = await db_session.execute(select(MarketOrder).where(MarketOrder.source_id == 424242))
    rows = result.scalars().all()
    assert len(rows) == 1  # não duplicou — atualizou a mesma linha
    assert rows[0].unit_price_silver == Decimal("50")
    assert rows[0].amount == 12


async def test_partial_scan_does_not_delete_an_order_absent_from_next_batch(db_session):
    """O payload observado não prova snapshot completo; ausência nunca significa remoção."""
    base_id = uuid.uuid4().int % 1_000_000_000
    expires = (datetime.now(timezone.utc) + timedelta(days=30)).replace(tzinfo=None).isoformat()

    def order(source_id: int, price: int) -> dict:
        return {
            "id": source_id,
            "item_id": "T2_PARTIAL_TEST",
            "group_type_id": "",
            "location_id": "1002",
            "quality_level": 1,
            "enchantment_level": 0,
            "unit_price_silver": price * 10_000,
            "amount": 1,
            "auction_type": "offer",
            "expires": expires,
        }

    await save_market_orders(
        async_session_maker,
        get_redis(),
        {"orders": [order(base_id, 100), order(base_id + 1, 110)]},
        "west",
    )
    await save_market_orders(
        async_session_maker,
        get_redis(),
        {"orders": [order(base_id, 90)]},
        "west",
    )

    rows = (
        await db_session.scalars(
            select(MarketOrder).where(MarketOrder.source_id.in_([base_id, base_id + 1]))
        )
    ).all()
    assert {row.source_id for row in rows} == {base_id, base_id + 1}
