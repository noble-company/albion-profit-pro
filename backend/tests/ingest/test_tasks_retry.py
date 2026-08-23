"""
Task 24/Task 06 da Fase 2.5 — confirma que erro transitório aciona `autoretry_for`,
enquanto erro de programação não é repetido, mas termina em FAILURE e quarentena.

Usa `task_always_eager` (mesmo padrão de tests/test_celery_app.py) pra rodar a task
inteira — incluindo o mecanismo de retry do Celery — sem precisar de um worker separado.
`task.apply()` executa `process_market_orders`, que chama `asyncio.run()` por dentro; como
a suíte roda num loop de sessão via pytest-asyncio, isso precisa rodar num executor (mesmo
motivo documentado em tests/ingest/test_tasks_lifecycle.py).

`user_id` aqui é só um identificador pra log (task 24) e, quando repassado ao processamento
real, alimenta `market_scan` (task 30) — mas como estes testes só se importam com o
mecanismo de retry, os stubs (`flaky`/`broken`) não repassam `user_id` adiante, evitando
precisar de um User real só pra satisfazer a FK de `market_scan`.
"""

import asyncio
import uuid

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import OperationalError

import src.ingest.tasks as tasks_module
from src.celery_app import celery_app
from src.prices.models import MarketOrder

PAYLOAD = {
    "orders": [
        {
            "id": 999,
            "item_id": "T2_FIBER",
            "group_type_id": "",
            "location_id": "1002",
            "quality_level": 1,
            "enchantment_level": 0,
            "unit_price_silver": 100,
            "amount": 1,
            "auction_type": "offer",
            "expires": "2026-08-22T00:00:00",
        }
    ]
}


async def _apply_eager(task, *args):
    """task_eager_propagates=False é o que faz o Celery, em modo eager, tratar a exceção
    `Retry` internamente e reexecutar a task na hora (recursivo dentro de .apply()) em vez
    de simplesmente propagá-la pro chamador — é assim que o autoretry_for funciona sem
    broker/worker reais."""
    previous = celery_app.conf.task_always_eager
    celery_app.conf.update(task_always_eager=True, task_eager_propagates=False)
    try:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, lambda: task.apply(args=args))
    finally:
        celery_app.conf.task_always_eager = previous


async def test_process_market_orders_retries_transient_error_then_succeeds(monkeypatch, db_session):
    real_save = tasks_module.save_market_orders
    calls = {"n": 0}

    async def flaky(sessionmaker, redis, payload, server_id, user_id=None):
        calls["n"] += 1
        if calls["n"] < 3:
            raise OperationalError("SELECT 1", {}, Exception("conexão caiu"))
        return await real_save(sessionmaker, redis, payload, server_id)

    monkeypatch.setattr(tasks_module, "save_market_orders", flaky)

    result = await _apply_eager(
        tasks_module.process_market_orders, PAYLOAD, str(uuid.uuid4()), "west"
    )
    result.get()

    assert calls["n"] == 3  # 2 falhas transitórias + 1 sucesso
    result = await db_session.execute(select(MarketOrder).where(MarketOrder.source_id == 999))
    assert len(result.scalars().all()) == 1


async def test_process_market_orders_retries_raw_connection_refused_then_succeeds(
    monkeypatch, db_session
):
    """`ConnectionRefusedError` (builtin) é o que o Postgres derrubado de verdade produz — a
    falha acontece no connect() cru, antes do asyncpg/SQLAlchemy embrulhar em
    OperationalError. Medido manualmente derrubando o container do Postgres (ver task 24);
    sem esse caso no autoretry_for, essa exceção caía no ramo "erro de programação" e era
    descartada sem retry, apesar de ser exatamente o cenário transitório que a task existe
    pra tratar."""
    real_save = tasks_module.save_market_orders
    calls = {"n": 0}

    async def flaky(sessionmaker, redis, payload, server_id, user_id=None):
        calls["n"] += 1
        if calls["n"] < 3:
            raise ConnectionRefusedError("Postgres fora do ar")
        return await real_save(sessionmaker, redis, payload, server_id)

    monkeypatch.setattr(tasks_module, "save_market_orders", flaky)

    result = await _apply_eager(
        tasks_module.process_market_orders, PAYLOAD, str(uuid.uuid4()), "west"
    )
    result.get()

    assert calls["n"] == 3
    result = await db_session.execute(select(MarketOrder).where(MarketOrder.source_id == 999))
    assert len(result.scalars().all()) == 1


async def test_process_market_orders_programming_error_is_failure_without_retry(monkeypatch):
    calls = {"n": 0}

    class _Model(BaseModel):
        a: int

    async def broken(sessionmaker, redis, payload, server_id, user_id=None):
        calls["n"] += 1
        _Model(a="not-an-int")  # dispara pydantic.ValidationError de verdade

    monkeypatch.setattr(tasks_module, "save_market_orders", broken)

    result = await _apply_eager(
        tasks_module.process_market_orders, PAYLOAD, str(uuid.uuid4()), "west"
    )

    assert calls["n"] == 1  # sem retry — ValidationError não está no autoretry_for
    assert result.state == "FAILURE"
