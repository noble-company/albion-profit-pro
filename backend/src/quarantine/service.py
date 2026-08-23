import hashlib
import json
import re
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from src.quarantine.models import QuarantinedTask, QuarantineReplay

SENSITIVE_KEY_PARTS = ("authorization", "password", "secret", "token")
REDACTED = "[REDACTED]"

_BEARER_RE = re.compile(r"(?i)\bBearer\s+[^\s,;]+")
_API_TOKEN_RE = re.compile(r"\bapk_[A-Za-z0-9_-]+")
_URL_CREDENTIAL_RE = re.compile(r"(?P<scheme>[a-z][a-z0-9+.-]*://)[^/@\s:]+:[^/@\s]+@", re.I)


def redact_text(value: str, limit: int | None = None) -> str:
    sanitized = _BEARER_RE.sub("Bearer [REDACTED]", value)
    sanitized = _API_TOKEN_RE.sub(REDACTED, sanitized)
    sanitized = _URL_CREDENTIAL_RE.sub(r"\g<scheme>[REDACTED]@", sanitized)
    return sanitized[:limit] if limit is not None else sanitized


def sanitize_payload(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            str(key): (
                REDACTED
                if any(part in str(key).lower() for part in SENSITIVE_KEY_PARTS)
                else sanitize_payload(item)
            )
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [sanitize_payload(item) for item in value]
    if isinstance(value, tuple):
        return [sanitize_payload(item) for item in value]
    if isinstance(value, str):
        return redact_text(value)
    if value is None or isinstance(value, (bool, int, float)):
        return value
    return redact_text(str(value))


def payload_sha256(payload: dict | list | None) -> str | None:
    if payload is None:
        return None
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonical.encode()).hexdigest()


async def persist_failure(
    sessionmaker: async_sessionmaker,
    failure: dict,
) -> None:
    sanitized_payload = sanitize_payload(failure.get("payload"))
    failed_at = failure.get("failed_at") or datetime.now(timezone.utc)
    if isinstance(failed_at, str):
        failed_at = datetime.fromisoformat(failed_at.replace("Z", "+00:00"))
    values = {
        "celery_task_id": failure["celery_task_id"],
        "task_name": failure["task_name"],
        "failure_kind": failure["failure_kind"],
        "topic": failure.get("topic"),
        "user_id": failure.get("user_id"),
        "api_token_id": failure.get("api_token_id"),
        "realm": failure.get("realm"),
        "attempts": failure["attempts"],
        "error_type": redact_text(failure["error_type"], 256),
        "error_summary": redact_text(failure["error_summary"], 2000),
        "traceback": redact_text(failure.get("traceback") or "", 50_000) or None,
        "payload": sanitized_payload,
        "payload_sha256": payload_sha256(sanitized_payload),
        "failed_at": failed_at,
    }
    async with sessionmaker() as session:
        stmt = pg_insert(QuarantinedTask).values(values)
        stmt = stmt.on_conflict_do_nothing(index_elements=[QuarantinedTask.celery_task_id])
        await session.execute(stmt)
        await session.commit()


async def list_quarantined_tasks(
    session: AsyncSession,
    status: str | None = "pending",
    limit: int = 100,
) -> list[QuarantinedTask]:
    stmt = select(QuarantinedTask).order_by(QuarantinedTask.failed_at.desc()).limit(limit)
    if status is not None:
        stmt = stmt.where(QuarantinedTask.status == status)
    return list((await session.scalars(stmt)).all())


def _replay_signature(failure: QuarantinedTask) -> tuple[list, dict]:
    if failure.task_name in {
        "ingest.process_market_orders",
        "ingest.process_market_history",
        "ingest.process_gold_prices",
    }:
        return [failure.payload], {
            "user_id": str(failure.user_id) if failure.user_id else None,
            "api_token_id": str(failure.api_token_id) if failure.api_token_id else None,
            "realm": failure.realm,
        }
    if failure.task_name in {"prices.rollup_diario", "prices.rollup_mensal", "prices.poda"}:
        return [], {}
    raise ValueError(f"task não autorizada para reprocessamento: {failure.task_name}")


async def requeue_failure(
    session: AsyncSession,
    celery_app,
    failure_id: uuid.UUID,
    actor: str,
) -> str:
    failure = await session.get(QuarantinedTask, failure_id, with_for_update=True)
    if failure is None:
        raise LookupError(f"falha não encontrada: {failure_id}")
    if failure.status != "pending":
        raise ValueError(f"falha não está pendente: status={failure.status}")

    args, kwargs = _replay_signature(failure)
    dispatched_task_id = str(uuid.uuid4())
    replay = QuarantineReplay(
        quarantined_task_id=failure.id,
        actor=actor,
        dispatched_task_id=dispatched_task_id,
        status="requested",
    )
    failure.status = "requeueing"
    session.add(replay)
    await session.commit()

    try:
        celery_app.signature(failure.task_name, args=args, kwargs=kwargs).apply_async(
            task_id=dispatched_task_id
        )
    except Exception as exc:
        replay.status = "publish_failed"
        replay.error_summary = redact_text(f"{type(exc).__name__}: {exc}", 2000)
        failure.status = "pending"
        await session.commit()
        raise

    now = datetime.now(timezone.utc)
    replay.status = "dispatched"
    replay.dispatched_at = now
    failure.status = "requeued"
    failure.requeued_at = now
    await session.commit()
    return dispatched_task_id
