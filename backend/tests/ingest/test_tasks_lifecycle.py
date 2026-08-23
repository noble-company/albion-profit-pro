"""
Cobre o wrapper síncrono das tasks (`process_market_orders`/`process_market_history`,
chamados direto — não `.delay()`), que é o caminho que roda de verdade no worker Celery em
produção e que nenhum outro teste exercitava (ver task 23, docs/04-revisao-fase-1.md, achado
C1).

Cada chamada roda `asyncio.run()` por dentro; como a suíte inteira roda num loop de
sessão via pytest-asyncio (ver tests/conftest.py e pyproject.toml), chamar a task
direto de dentro de um `async def` estouraria "asyncio.run() cannot be called from a
running event loop". Por isso a task roda num executor (thread separada, sem loop).
"""

import asyncio
import json
from pathlib import Path

from sqlalchemy import func, select, text

from src.database import async_session_maker
from src.ingest.schemas import MarketHistoriesUploadIn, MarketUploadIn
from src.ingest.tasks import process_market_history, process_market_orders
from src.prices.models import MarketHistoryEntry, MarketOrder
from tests.conftest import criar_usuario

ORDERS_FIXTURE_PATH = (
    Path(__file__).resolve().parent.parent / "fixtures" / "wire" / "marketorders-real-t2fiber.json"
)
HISTORY_FIXTURE_PATH = (
    Path(__file__).resolve().parent.parent
    / "fixtures"
    / "wire"
    / "markethistories-real-t2fiber-ts2.json"
)


def _load_orders_payload() -> dict:
    raw = json.loads(ORDERS_FIXTURE_PATH.read_text())
    return MarketUploadIn.model_validate(raw).model_dump(by_alias=False)


def _load_history_payload() -> dict:
    raw = json.loads(HISTORY_FIXTURE_PATH.read_text())
    return MarketHistoriesUploadIn.model_validate(raw).model_dump(by_alias=False)


async def _worker_connection_count() -> int:
    async with async_session_maker() as session:
        result = await session.execute(
            text("SELECT count(*) FROM pg_stat_activity WHERE application_name LIKE '%worker%'")
        )
        return result.scalar_one()


async def test_process_market_orders_survives_two_consecutive_task_calls(db_session):
    payload = _load_orders_payload()
    source_ids = [o["id"] for o in payload["orders"]]

    # `user_id` precisa ser de um usuário real desde a task 30 — grava também em
    # `market_scan` (FK pra `user`), diferente de `market_order` que só loga o valor.
    user = await criar_usuario(db_session)
    await db_session.commit()

    baseline = await _worker_connection_count()

    loop = asyncio.get_running_loop()

    # Chama o wrapper síncrono (não a corotina interna) duas vezes seguidas — é
    # exatamente o padrão que quebrava antes da task 23 (2ª chamada reaproveitava
    # conexão presa a um loop já fechado pela 1ª). Desde a task 27, `market_order` é
    # upsert por source_id — as duas chamadas usam o MESMO payload (mesmo source_id),
    # então o resultado esperado é 50 linhas, não 100 (a 2ª "varredura" atualiza a 1ª).
    await loop.run_in_executor(None, process_market_orders, payload, str(user.id))
    await loop.run_in_executor(None, process_market_orders, payload, str(user.id))

    count = await db_session.scalar(
        select(func.count()).select_from(MarketOrder).where(MarketOrder.source_id.in_(source_ids))
    )
    assert count == len(payload["orders"])

    after = await _worker_connection_count()
    assert after == baseline


async def test_process_market_history_survives_two_consecutive_task_calls(db_session):
    """Mesma cobertura acima, pro segundo tópico de ingest — nenhum teste chamava o wrapper
    síncrono de `process_market_history` antes desta task (o resto do C1 que sobrava)."""
    payload = _load_history_payload()
    item_id = payload["albion_id"]

    user = await criar_usuario(db_session)
    await db_session.commit()

    baseline = await _worker_connection_count()

    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, process_market_history, payload, str(user.id))
    await loop.run_in_executor(None, process_market_history, payload, str(user.id))

    count = await db_session.scalar(
        select(func.count())
        .select_from(MarketHistoryEntry)
        .where(MarketHistoryEntry.item_id == item_id)
    )
    assert count == len(payload["histories"])  # upsert por bucket, não duplicou

    after = await _worker_connection_count()
    assert after == baseline
