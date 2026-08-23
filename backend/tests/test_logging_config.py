"""
Confirma que o worker Celery (que nunca importa src/main.py) ainda assim loga em JSON —
era o achado P3: structlog configurado só em src/main.py, então o worker logava sem
estrutura mesmo depois de a task 24 adicionar chamadas de log.
"""

import structlog


def test_importing_celery_app_configures_json_logging():
    import src.celery_app  # noqa: F401 — o import por si só já chama configure_logging()

    processors = structlog.get_config()["processors"]
    assert any(isinstance(p, structlog.processors.JSONRenderer) for p in processors)
