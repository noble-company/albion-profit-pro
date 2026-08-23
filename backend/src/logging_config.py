import structlog


def configure_logging() -> None:
    """Configura o mesmo formato estruturado na API e nos processos Celery."""
    structlog.configure(
        processors=[
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.add_log_level,
            structlog.processors.format_exc_info,  # sem isso, exc_info=True vira só "true" no JSON
            structlog.processors.JSONRenderer(),
        ],
    )
