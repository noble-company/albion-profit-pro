import asyncio

from src.celery_app import celery_app


def _check_rabbitmq_sync() -> None:
    with celery_app.connection_for_write() as connection:
        connection.ensure_connection(max_retries=0, timeout=2)


async def check_rabbitmq() -> None:
    """Evita bloquear a event loop do FastAPI enquanto o Kombu abre a conexão AMQP."""
    await asyncio.wait_for(asyncio.to_thread(_check_rabbitmq_sync), timeout=3)
