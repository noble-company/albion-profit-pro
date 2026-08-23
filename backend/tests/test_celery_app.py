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

from src.celery_app import celery_app


@celery_app.task
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
    assert celery_app.conf.worker_prefetch_multiplier == 1
    assert celery_app.conf.task_serializer == "json"
    assert celery_app.conf.timezone == "UTC"


def test_beat_schedule_has_rollup_and_poda_jobs():
    """Task 31 — job periódico é greenfield neste projeto; confirma que os 3 jobs estão
    registrados no `beat_schedule` com o nome de task correto (o que `celery beat` de fato lê
    pra despachar)."""
    schedule = celery_app.conf.beat_schedule
    assert schedule["rollup-diario"]["task"] == "prices.rollup_diario"
    assert schedule["rollup-mensal"]["task"] == "prices.rollup_mensal"
    assert schedule["poda"]["task"] == "prices.poda"
