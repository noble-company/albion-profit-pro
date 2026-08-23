import time

from redis import Redis

from src.celery_app import celery_app


@celery_app.task(name="tests.task11.block_maintenance")
def block_maintenance(redis_url: str, marker: str) -> None:
    redis = Redis.from_url(redis_url, decode_responses=True)
    redis.set(f"{marker}:maintenance-started", "1", ex=120)
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline and redis.get(f"{marker}:release") != "1":
        time.sleep(0.1)
    redis.set(f"{marker}:maintenance-done", "1", ex=120)
    redis.close()


@celery_app.task(name="tests.task11.ingest_probe")
def ingest_probe(redis_url: str, marker: str) -> None:
    redis = Redis.from_url(redis_url, decode_responses=True)
    redis.set(f"{marker}:ingest-done", "1", ex=120)
    redis.close()
