from datetime import datetime, timezone

import structlog
from celery import Task

from src.quarantine.service import redact_text, sanitize_payload

log = structlog.get_logger()


class QuarantinableTask(Task):
    """Publica uma descrição sanitizada quando uma task esgota retries ou falha de vez."""

    abstract = True
    failure_kind = "unknown"
    failure_topic: str | None = None

    def _argument(self, args, kwargs, name: str, position: int):
        if name in kwargs:
            return kwargs[name]
        return args[position] if len(args) > position else None

    def on_failure(self, exc, task_id, args, kwargs, einfo):
        # Import tardio evita ciclo: quarantine.tasks importa celery_app, que registra as
        # próprias tasks enquanto este módulo é usado como base pelas demais.
        from src.quarantine.tasks import persist_task_failure

        payload = (
            self._argument(args, kwargs, "payload", 0) if self.failure_kind == "ingest" else None
        )
        user_id = self._argument(args, kwargs, "user_id", 1)
        realm = self._argument(args, kwargs, "realm", 2)
        api_token_id = self._argument(args, kwargs, "api_token_id", 3)
        failure = {
            "celery_task_id": task_id,
            "task_name": self.name,
            "failure_kind": self.failure_kind,
            "topic": self.failure_topic,
            "user_id": user_id,
            "api_token_id": api_token_id,
            "realm": realm,
            "attempts": int(getattr(self.request, "retries", 0)) + 1,
            "error_type": f"{type(exc).__module__}.{type(exc).__qualname__}",
            "error_summary": redact_text(str(exc), 2000),
            "traceback": redact_text(getattr(einfo, "traceback", "") or "", 50_000),
            "payload": sanitize_payload(payload),
            "failed_at": datetime.now(timezone.utc).isoformat(),
        }
        try:
            persist_task_failure.apply_async(
                kwargs={"failure": failure},
                retry=True,
                retry_policy={
                    "max_retries": 5,
                    "interval_start": 0,
                    "interval_step": 0.5,
                    "interval_max": 2,
                },
            )
        except Exception:
            # A execução original termina em FAILURE. Esse estado não fica no result backend,
            # pois a quarentena PostgreSQL é autoritativa.
            # Este log é a última defesa se o broker cair durante a publicação.
            log.critical(
                "quarantine.publicacao_falhou",
                task_name=self.name,
                celery_task_id=task_id,
                exc_info=True,
            )

        return super().on_failure(exc, task_id, args, kwargs, einfo)
