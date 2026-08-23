import structlog


def configure_logging() -> None:
    """Chamado tanto por src/main.py quanto por src/celery_app.py — sem isso o worker
    Celery nunca configura o structlog e os logs saem sem estrutura (ver task 24,
    docs/04-revisao-fase-1.md, achado P3)."""
    structlog.configure(
        processors=[
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.add_log_level,
            structlog.processors.format_exc_info,  # sem isso, exc_info=True vira só "true" no JSON
            structlog.processors.JSONRenderer(),
        ],
    )
