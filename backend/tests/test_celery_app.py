"""
Confirma que o app Celery está configurado corretamente e consegue executar uma
task, sem depender de um worker real rodando em processo separado — usa
task_always_eager (modo síncrono de teste). `celery_app.conf.broker_url` já
aponta pro RabbitMQ efêmero do testcontainers (tests/conftest.py, task 20),
então `.delay()` também funcionaria em modo não-eager contra um broker real —
eager é só mais simples/rápido pra esse teste específico, não publica nem
consome da fila de verdade.

Importante: `task_always_eager` é setado só dentro do teste que precisa dele
(não a nível de módulo) e restaurado ao sair — `celery_app` é um singleton
global, e uma atribuição a nível de módulo vaza pra QUALQUER outro arquivo de
teste que use `celery_app` (ex: tests/ingest/test_router.py, que deliberadamente
não quer modo eager), porque o pytest importa todos os módulos de teste na fase
de coleta antes de rodar qualquer um deles — achado real ao implementar a task 17.
"""

import uuid

from src.celery_app import (
    INGEST_QUEUE,
    MAINTENANCE_QUEUE,
    QUARANTINE_QUEUE,
    celery_app,
)
from src.ingest.tasks import process_gold_prices
from src.prices.tasks import poda


@celery_app.task(ignore_result=False)
def _ping():
    return "pong"


def test_task_runs_and_returns_result():
    previous = celery_app.conf.task_always_eager
    celery_app.conf.update(task_always_eager=True, task_eager_propagates=True)
    try:
        result = _ping.delay()
        assert result.get() == "pong"
    finally:
        celery_app.conf.task_always_eager = previous


def test_conf_has_expected_settings():
    assert celery_app.conf.task_acks_late is True
    assert celery_app.conf.task_acks_on_failure_or_timeout is True
    assert celery_app.conf.task_reject_on_worker_lost is True
    assert celery_app.conf.worker_prefetch_multiplier == 1
    assert celery_app.conf.task_serializer == "json"
    assert celery_app.conf.timezone == "UTC"
    assert "src.quarantine.tasks" in celery_app.conf.include
    assert celery_app.conf.task_ignore_result is True
    assert celery_app.conf.task_store_errors_even_if_ignored is False
    assert celery_app.conf.result_expires == 3600
    assert celery_app.conf.task_create_missing_queues is False
    assert celery_app.conf.worker_send_task_events is True
    assert celery_app.conf.task_send_sent_event is True


def test_all_product_tasks_route_to_declared_durable_queues():
    expected = {
        "ingest.process_market_orders": INGEST_QUEUE,
        "ingest.process_market_history": INGEST_QUEUE,
        "ingest.process_gold_prices": INGEST_QUEUE,
        "prices.rollup_diario": MAINTENANCE_QUEUE,
        "prices.rollup_mensal": MAINTENANCE_QUEUE,
        "prices.poda": MAINTENANCE_QUEUE,
        "quarantine.persist_task_failure": QUARANTINE_QUEUE,
        "operations.log_queue_metrics": QUARANTINE_QUEUE,
    }
    configured = {queue.name: queue for queue in celery_app.conf.task_queues}
    assert set(configured) == {INGEST_QUEUE, MAINTENANCE_QUEUE, QUARANTINE_QUEUE}
    assert all(queue.durable and queue.exchange.durable for queue in configured.values())

    for task_name, queue_name in expected.items():
        route = celery_app.amqp.router.route({}, task_name, args=(), kwargs={})
        assert route["queue"].name == queue_name


def test_time_limits_are_applied_by_task_profile():
    celery_app.finalize()
    assert celery_app.tasks["ingest.process_market_orders"].soft_time_limit == 120
    assert celery_app.tasks["ingest.process_market_orders"].time_limit == 150
    assert poda.soft_time_limit == 1800
    assert poda.time_limit == 1860


def test_ingest_result_is_not_persisted_in_redis():
    task_id = f"task11-{uuid.uuid4()}"
    result_key = celery_app.backend.get_key_for_task(task_id)
    celery_app.backend.client.delete(result_key)

    process_gold_prices.apply(
        args=({"prices": []}, str(uuid.uuid4()), "west"),
        task_id=task_id,
    )

    assert celery_app.backend.client.get(result_key) is None


def test_beat_schedule_has_rollup_and_poda_jobs():
    """Task 04 da Fase 2.5: mensal integra o reparo diário sequencial, não é outro job
    concorrente; a poda tem offset e repete o reparo antes de apagar bruto."""
    schedule = celery_app.conf.beat_schedule
    assert schedule["rollup-diario"]["task"] == "prices.rollup_diario"
    assert schedule["rollup-diario"]["options"]["queue"] == MAINTENANCE_QUEUE
    assert "rollup-mensal" not in schedule
    assert schedule["poda"]["task"] == "prices.poda"
    assert schedule["poda"]["schedule"].minute == {30}
    assert schedule["poda"]["options"]["queue"] == MAINTENANCE_QUEUE
    assert schedule["metricas-das-filas"]["options"]["queue"] == QUARANTINE_QUEUE
