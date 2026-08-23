import asyncio
import subprocess
import sys
import time
import uuid
from pathlib import Path

from redis import Redis

from src.celery_app import QUARANTINE_QUEUE, celery_app
from src.config import get_settings
from tests.quarantine.worker_loss_tasks import worker_loss_probe


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
            f"worker-loss-{uuid.uuid4().hex[:8]}@%h",
            "--loglevel=WARNING",
            "--without-gossip",
            "--without-mingle",
            "--without-heartbeat",
            "--include",
            "tests.quarantine.worker_loss_tasks",
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
        value = redis.get(key)
        if value is not None:
            return value
        await asyncio.sleep(0.1)
    return None


async def test_unacked_task_is_redelivered_after_real_worker_process_dies():
    settings = get_settings()
    redis = Redis.from_url(settings.redis_url, decode_responses=True)
    marker = f"test:worker-loss:{uuid.uuid4()}"
    queue = QUARANTINE_QUEUE
    first_worker = None
    second_worker = None
    first_log = ""
    second_log = ""
    try:
        with celery_app.connection_for_write() as connection:
            channel = connection.channel()
            celery_app.amqp.queues[queue].bind(channel).declare()
            channel.queue_purge(queue)
        first_worker = _start_worker(queue)
        worker_loss_probe.apply_async(args=(settings.redis_url, marker), queue=queue)
        started = await _wait_for(redis, f"{marker}:started", timeout=20)
        assert started == "1", _stop_worker(first_worker)

        first_log = _stop_worker(first_worker)
        first_worker = None

        second_worker = _start_worker(queue)
        done = await _wait_for(redis, f"{marker}:done", timeout=20)
        assert done == "2", (
            f"first worker:\n{first_log}\nsecond worker:\n{_stop_worker(second_worker)}"
        )
        assert redis.get(f"{marker}:attempts") == "2"
    finally:
        if first_worker is not None:
            first_log = _stop_worker(first_worker)
        if second_worker is not None:
            second_log = _stop_worker(second_worker)
        redis.delete(f"{marker}:attempts", f"{marker}:started", f"{marker}:done")
        redis.close()

    assert "received unregistered task" not in (first_log + second_log).lower()
