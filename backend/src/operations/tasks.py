import structlog

from src.celery_app import INGEST_QUEUE, MAINTENANCE_QUEUE, QUARANTINE_QUEUE, celery_app

log = structlog.get_logger()
MONITORED_QUEUES = (INGEST_QUEUE, MAINTENANCE_QUEUE, QUARANTINE_QUEUE)


def queue_depths() -> dict[str, dict[str, int]]:
    """Consulta contagem/consumidores sem retirar mensagens das filas."""
    snapshots = {}
    with celery_app.connection_for_read() as connection:
        channel = connection.channel()
        try:
            for queue_name in MONITORED_QUEUES:
                declared = channel.queue_declare(queue=queue_name, passive=True)
                snapshots[queue_name] = {
                    "mensagens": int(declared.message_count),
                    "consumidores": int(declared.consumer_count),
                }
        finally:
            channel.close()
    return snapshots


@celery_app.task(name="operations.log_queue_metrics")
def log_queue_metrics() -> None:
    log.info("celery.filas", filas=queue_depths())
