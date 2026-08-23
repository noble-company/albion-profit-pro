import asyncio
import json
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from pydantic import BaseModel
from sqlalchemy import func, select, text
from sqlalchemy.exc import OperationalError

import src.ingest.tasks as ingest_tasks
import src.prices.tasks as price_tasks
from scripts.quarantine import _reprocess
from src.celery_app import celery_app
from src.database import async_session_maker, engine
from src.prices.models import MarketOrder
from src.quarantine.models import QuarantinedTask, QuarantineReplay
from src.quarantine.service import persist_failure, requeue_failure
from tests.conftest import criar_usuario


def _payload(source_id: int = 880_001) -> dict:
    expires = (datetime.now(timezone.utc) + timedelta(days=30)).replace(tzinfo=None).isoformat()
    return {
        "orders": [
            {
                "id": source_id,
                "item_id": "T2_QUARANTINE_TEST",
                "group_type_id": "",
                "location_id": "1002",
                "quality_level": 1,
                "enchantment_level": 0,
                "unit_price_silver": 1_000_000,
                "amount": 5,
                "auction_type": "offer",
                "expires": expires,
            }
        ]
    }


async def _apply_eager(task, args=(), kwargs=None):
    previous = {
        "always_eager": celery_app.conf.task_always_eager,
        "eager_propagates": celery_app.conf.task_eager_propagates,
    }
    celery_app.conf.update(task_always_eager=True, task_eager_propagates=False)
    try:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            None, lambda: task.apply(args=args, kwargs=kwargs or {}, throw=False)
        )
    finally:
        celery_app.conf.update(
            task_always_eager=previous["always_eager"],
            task_eager_propagates=previous["eager_propagates"],
        )


async def test_programming_error_is_failure_and_persists_sanitized_context(monkeypatch, db_session):
    calls = 0
    user_id = uuid.uuid4()
    api_token_id = uuid.uuid4()
    raw_token = "apk_super_secret_value"
    raw_password = "database-password"

    class _Model(BaseModel):
        amount: int

    async def broken(sessionmaker, redis, payload, realm, user_id=None):
        nonlocal calls
        calls += 1
        try:
            _Model(amount="invalid")
        except Exception as exc:
            raise ValueError(
                f"Bearer {raw_token} postgresql://admin:{raw_password}@db/profit"
            ) from exc

    monkeypatch.setattr(ingest_tasks, "save_market_orders", broken)
    payload = _payload()
    payload["Authorization"] = f"Bearer {raw_token}"
    payload["nested"] = {"password": raw_password}

    result = await _apply_eager(
        ingest_tasks.process_market_orders,
        args=(payload,),
        kwargs={
            "user_id": str(user_id),
            "realm": "west",
            "api_token_id": str(api_token_id),
        },
    )

    assert result.state == "FAILURE"
    assert calls == 1
    failure = await db_session.scalar(
        select(QuarantinedTask).where(QuarantinedTask.celery_task_id == result.id)
    )
    assert failure is not None
    assert failure.failure_kind == "ingest"
    assert failure.topic == "marketorders"
    assert failure.user_id == user_id
    assert failure.api_token_id == api_token_id
    assert failure.realm == "west"
    assert failure.attempts == 1
    serialized = json.dumps(
        {
            "error": failure.error_summary,
            "traceback": failure.traceback,
            "payload": failure.payload,
        }
    )
    assert raw_token not in serialized
    assert raw_password not in serialized
    assert "Bearer [REDACTED]" in serialized
    assert failure.payload_sha256 is not None


async def test_transient_error_exhausts_retries_then_becomes_observable(monkeypatch, db_session):
    calls = 0

    async def unavailable(sessionmaker, redis, payload, realm, user_id=None):
        nonlocal calls
        calls += 1
        raise OperationalError("SELECT 1", {}, Exception("database unavailable"))

    monkeypatch.setattr(ingest_tasks, "save_market_orders", unavailable)
    result = await _apply_eager(
        ingest_tasks.process_market_orders,
        args=(_payload(880_002),),
        kwargs={"user_id": str(uuid.uuid4()), "realm": "west"},
    )

    assert result.state == "FAILURE"
    assert calls == 6
    failure = await db_session.scalar(
        select(QuarantinedTask).where(QuarantinedTask.celery_task_id == result.id)
    )
    assert failure is not None
    assert failure.attempts == 6
    assert failure.error_type.endswith("OperationalError")


async def test_failure_persistence_is_idempotent_by_celery_task_id(db_session):
    task_id = str(uuid.uuid4())
    failure = {
        "celery_task_id": task_id,
        "task_name": "prices.rollup_diario",
        "failure_kind": "maintenance",
        "topic": "rollup_diario",
        "attempts": 1,
        "error_type": "builtins.RuntimeError",
        "error_summary": "broken",
        "payload": None,
    }
    await persist_failure(async_session_maker, failure)
    await persist_failure(async_session_maker, failure)

    count = await db_session.scalar(
        select(func.count())
        .select_from(QuarantinedTask)
        .where(QuarantinedTask.celery_task_id == task_id)
    )
    assert count == 1


async def test_periodic_job_failure_is_quarantined_as_maintenance(monkeypatch, db_session):
    async def broken(sessionmaker):
        raise RuntimeError("rollup invariant broken")

    monkeypatch.setattr(price_tasks, "_rollup_diario", broken)
    result = await _apply_eager(price_tasks.rollup_diario)

    assert result.state == "FAILURE"
    failure = await db_session.scalar(
        select(QuarantinedTask).where(QuarantinedTask.celery_task_id == result.id)
    )
    assert failure is not None
    assert failure.failure_kind == "maintenance"
    assert failure.topic == "rollup_diario"
    assert failure.payload is None


class _FakeSignature:
    def __init__(self, app, task_name, args, kwargs):
        self.app = app
        self.task_name = task_name
        self.args = args
        self.kwargs = kwargs

    def apply_async(self, task_id):
        self.app.dispatched = {
            "task_name": self.task_name,
            "args": self.args,
            "kwargs": self.kwargs,
            "task_id": task_id,
        }


class _FakeCelery:
    dispatched = None

    def signature(self, task_name, args, kwargs):
        return _FakeSignature(self, task_name, args, kwargs)


async def test_reprocess_is_whitelisted_audited_and_idempotent(db_session):
    user = await criar_usuario(db_session)
    await db_session.commit()
    failure = QuarantinedTask(
        celery_task_id=str(uuid.uuid4()),
        task_name="ingest.process_market_orders",
        failure_kind="ingest",
        topic="marketorders",
        user_id=user.id,
        realm="west",
        attempts=1,
        error_type="builtins.RuntimeError",
        error_summary="broken",
        payload=_payload(880_003),
    )
    db_session.add(failure)
    await db_session.commit()

    fake_app = _FakeCelery()
    dispatched_id = await requeue_failure(db_session, fake_app, failure.id, "operator@example")

    assert fake_app.dispatched["task_name"] == "ingest.process_market_orders"
    assert fake_app.dispatched["task_id"] == dispatched_id
    assert fake_app.dispatched["kwargs"]["user_id"] == str(user.id)
    assert fake_app.dispatched["kwargs"]["realm"] == "west"
    replay = await db_session.scalar(
        select(QuarantineReplay).where(QuarantineReplay.quarantined_task_id == failure.id)
    )
    assert replay is not None
    assert replay.actor == "operator@example"
    assert replay.status == "dispatched"

    loop = asyncio.get_running_loop()
    for _ in range(2):
        await loop.run_in_executor(
            None,
            lambda: ingest_tasks.process_market_orders(
                *fake_app.dispatched["args"], **fake_app.dispatched["kwargs"]
            ),
        )
    count = await db_session.scalar(
        select(func.count()).select_from(MarketOrder).where(MarketOrder.source_id == 880_003)
    )
    assert count == 1

    with pytest.raises(ValueError, match="não está pendente"):
        await requeue_failure(db_session, fake_app, failure.id, "operator@example")


async def test_reprocess_requires_literal_confirmation_before_database_access():
    failure_id = uuid.uuid4()
    with pytest.raises(PermissionError, match="--confirm"):
        await _reprocess(failure_id, "operator@example", "wrong-id")


async def test_quarantine_migration_upgrades_current_schema_and_downgrades_cleanly():
    from alembic.config import Config

    from alembic import command

    alembic_cfg = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    loop = asyncio.get_running_loop()
    try:
        await loop.run_in_executor(None, command.downgrade, alembic_cfg, "a3b318a44306")
        async with async_session_maker() as session:
            table = await session.scalar(text("SELECT to_regclass('public.quarantined_task')"))
            assert table is None

        await loop.run_in_executor(None, command.upgrade, alembic_cfg, "head")
        async with async_session_maker() as session:
            table = await session.scalar(text("SELECT to_regclass('public.quarantined_task')"))
            replay_table = await session.scalar(
                text("SELECT to_regclass('public.quarantine_replay')")
            )
            assert table == "quarantined_task"
            assert replay_table == "quarantine_replay"
    finally:
        await loop.run_in_executor(None, command.upgrade, alembic_cfg, "head")
        await engine.dispose()
