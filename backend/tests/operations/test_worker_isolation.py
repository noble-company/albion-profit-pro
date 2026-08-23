import asyncio
import subprocess
import sys
import time
import uuid
from pathlib import Path

from redis import Redis

from src.celery_app import INGEST_QUEUE, MAINTENANCE_QUEUE, celery_app
from src.config import get_settings
from tests.operations.isolation_tasks import block_maintenance, ingest_probe


def _start_worker(queue: str) -> subprocess.Popen:
    return subprocess.Popen(
        [
            sys.executable,
            "-m",
            "celery",
            "-A",
            "src.celery_app:celery_app",
            "worker",
            "--pool=solo",
            "--concurrency=1",
            "--queues",
            queue,
            "--hostname",
            f"task11-{queue}-{uuid.uuid4().hex[:8]}@%h",
            "--loglevel=WARNING",
            "--without-gossip",
            "--without-mingle",
            "--without-heartbeat",
            "--include",
            "tests.operations.isolation_tasks",
        ],
        cwd=str(Path(__file__).resolve().parents[2]),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )


def _stop_worker(process: subprocess.Popen | None) -> str:
    if process is None:
        return ""
    if process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)
    return process.stdout.read() if process.stdout else ""


async def _wait_for(redis: Redis, key: str, timeout: float) -> str | None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if value := redis.get(key):
            return value
        await asyncio.sleep(0.1)
    return None


async def test_blocked_maintenance_worker_does_not_delay_ingest_worker():
    settings = get_settings()
    redis = Redis.from_url(settings.redis_url, decode_responses=True)
    marker = f"test:task11:isolation:{uuid.uuid4()}"
    maintenance_worker = None
    ingest_worker = None
    logs = []
    try:
        with celery_app.connection_for_write() as connection:
            channel = connection.channel()
            celery_app.amqp.queues[MAINTENANCE_QUEUE].bind(channel).declare()
            celery_app.amqp.queues[INGEST_QUEUE].bind(channel).declare()
            channel.queue_purge(MAINTENANCE_QUEUE)
            channel.queue_purge(INGEST_QUEUE)
        maintenance_worker = _start_worker(MAINTENANCE_QUEUE)
        ingest_worker = _start_worker(INGEST_QUEUE)
        block_maintenance.apply_async(args=(settings.redis_url, marker), queue=MAINTENANCE_QUEUE)
        started = await _wait_for(redis, f"{marker}:maintenance-started", 20)
        assert started == "1", _stop_worker(maintenance_worker)

        ingest_probe.apply_async(args=(settings.redis_url, marker), queue=INGEST_QUEUE)
        consumed = await _wait_for(redis, f"{marker}:ingest-done", 10)
        assert consumed == "1", _stop_worker(ingest_worker)
        assert redis.get(f"{marker}:maintenance-done") is None
    finally:
        redis.set(f"{marker}:release", "1", ex=30)
        logs.append(_stop_worker(maintenance_worker))
        logs.append(_stop_worker(ingest_worker))
        redis.delete(
            f"{marker}:maintenance-started",
            f"{marker}:maintenance-done",
            f"{marker}:ingest-done",
            f"{marker}:release",
        )
        redis.close()

    assert "received unregistered task" not in "".join(logs).lower()
