"""
Testa a lógica de gravação de `save_market_orders` chamando a coroutine diretamente, não
`.delay()`. Motivo: `.delay()` em modo eager roda a task com um `asyncio.run()`
próprio (correto em produção — o worker Celery é um processo separado, sem
loop já rodando); chamado de dentro de um teste `async def` (que já roda numa
loop, via pytest-asyncio), isso bate em "asyncio.run() cannot be called from a
running event loop". A cobertura de ".delay() disparar a task de verdade" fica
com tests/ingest/test_router.py (publica no RabbitMQ real do testcontainers).
`save_market_history` tem cobertura dedicada em tests/ingest/test_market_history_bucket.py
(task 26 — bucket global, sem user_id). `market_order` (sem user_id desde a task 27) tem
cobertura de upsert/dedup dedicada em tests/ingest/test_market_order_upsert.py.
"""

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select

from src.cache.redis_client import get_redis, mget_book_depths
from src.database import async_session_maker
from src.ingest.service import save_market_orders
from src.prices.models import MarketOrder


def _unique_item_id() -> str:
    return f"T2_TESTITEM_{uuid.uuid4().hex[:8]}"


async def test_process_market_orders_inserts_batch_and_updates_cache(db_session):
    item_id = _unique_item_id()
    # relativo a "agora", não uma data fixa — a task 29 passou a filtrar `expires > now()`
    # de verdade na profundidade do livro.
    future_expires = (
        (datetime.now(timezone.utc) + timedelta(days=30)).replace(tzinfo=None).isoformat()
    )
    payload = {
        "orders": [
            {
                "id": 1,
                "item_id": item_id,
                "group_type_id": "",
                "location_id": "1002",
                "quality_level": 1,
                "enchantment_level": 0,
                "unit_price_silver": 1000000,  # wire (x10.000) -> 100 silver real
                "amount": 50,
                "auction_type": "offer",
                "expires": future_expires,
            },
            {
                "id": 2,
                "item_id": item_id,
                "group_type_id": "",
                "location_id": "1002",
                "quality_level": 1,
                "enchantment_level": 0,
                "unit_price_silver": 1200000,  # wire (x10.000) -> 120 silver real
                "amount": 10,
                "auction_type": "offer",
                "expires": future_expires,
            },
        ]
    }

    await save_market_orders(async_session_maker, get_redis(), payload)

    result = await db_session.execute(select(MarketOrder).where(MarketOrder.item_id == item_id))
    rows = result.scalars().all()
    assert len(rows) == 2

    cached = (await mget_book_depths(get_redis(), item_id, [("1002", 1, 0)]))[("1002", 1, 0)]
    assert cached is not None
    # profundidade recalculada do Postgres (task 29, achado C4): venda.preco é o MENOR
    # preço de venda do livro inteiro pra essa combinação (100), não o primeiro/último
    # do lote (120) — e soma as duas ordens na quantidade total.
    assert Decimal(cached["venda"]["preco"]) == Decimal("100")
    assert cached["venda"]["total_unidades"] == 60
    assert cached["venda"]["qtd_ordens"] == 2


async def test_process_market_orders_with_empty_list_does_nothing():
    await save_market_orders(async_session_maker, get_redis(), {"orders": []})  # não levanta
