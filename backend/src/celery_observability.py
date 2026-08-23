"""Logs estruturados para o ciclo de vida das tasks sem usar o result backend."""

import time
from datetime import datetime, timezone

import structlog
from celery.signals import before_task_publish, task_failure, task_postrun, task_prerun, task_retry

log = structlog.get_logger()
_started_at: dict[str, float] = {}
_PUBLISHED_AT_HEADER = "profitpro_published_at"


def _utc_timestamp() -> float:
    return datetime.now(timezone.utc).timestamp()


@before_task_publish.connect
def on_task_publish(headers=None, routing_key=None, **_kwargs) -> None:
    if headers is None:
        return
    headers[_PUBLISHED_AT_HEADER] = _utc_timestamp()
    log.info(
        "celery.task_publicada",
        task_name=headers.get("task"),
        celery_task_id=headers.get("id"),
        fila=routing_key,
    )


@task_prerun.connect
def on_task_prerun(task_id=None, task=None, **_kwargs) -> None:
    if task_id is None or task is None:
        return
    _started_at[task_id] = time.monotonic()
    request_headers = getattr(task.request, "headers", None) or {}
    published_at = request_headers.get(_PUBLISHED_AT_HEADER)
    wait_ms = None
    if isinstance(published_at, (int, float)):
        wait_ms = max(0, int((_utc_timestamp() - published_at) * 1000))
    delivery = getattr(task.request, "delivery_info", None) or {}
    log.info(
        "celery.task_iniciada",
        task_name=task.name,
        celery_task_id=task_id,
        fila=delivery.get("routing_key"),
        idade_fila_ms=wait_ms,
        tentativa=int(getattr(task.request, "retries", 0)) + 1,
    )


@task_retry.connect
def on_task_retry(request=None, reason=None, **_kwargs) -> None:
    log.warning(
        "celery.task_retry",
        task_name=getattr(request, "task", None),
        celery_task_id=getattr(request, "id", None),
        tentativa=int(getattr(request, "retries", 0)) + 1 if request is not None else None,
        motivo=type(reason).__name__ if reason is not None else None,
    )


@task_failure.connect
def on_task_failure(task_id=None, sender=None, exception=None, **_kwargs) -> None:
    log.error(
        "celery.task_falhou",
        task_name=getattr(sender, "name", None),
        celery_task_id=task_id,
        erro_tipo=type(exception).__name__ if exception is not None else None,
    )


@task_postrun.connect
def on_task_postrun(task_id=None, task=None, state=None, **_kwargs) -> None:
    started_at = _started_at.pop(task_id, None) if task_id is not None else None
    duration_ms = int((time.monotonic() - started_at) * 1000) if started_at is not None else None
    log.info(
        "celery.task_finalizada",
        task_name=getattr(task, "name", None),
        celery_task_id=task_id,
        estado=state,
        duracao_ms=duration_ms,
    )
