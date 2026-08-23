import time

from redis import Redis

from src.celery_app import celery_app
from src.quarantine.task_base import QuarantinableTask


@celery_app.task(
    name="tests.worker_loss_probe",
    bind=True,
    base=QuarantinableTask,
    acks_late=True,
    reject_on_worker_lost=True,
)
def worker_loss_probe(self, redis_url: str, marker: str) -> None:
    """A primeira entrega bloqueia; a redelivery confirma e termina rapidamente."""
    redis = Redis.from_url(redis_url, decode_responses=True)
    attempt = redis.incr(f"{marker}:attempts")
    redis.set(f"{marker}:started", str(attempt), ex=120)
    if attempt == 1:
        time.sleep(60)
    redis.set(f"{marker}:done", str(attempt), ex=120)


worker_loss_probe.failure_kind = "maintenance"
worker_loss_probe.failure_topic = "worker_loss_probe"
