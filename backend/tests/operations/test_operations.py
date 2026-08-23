from pathlib import Path
from types import SimpleNamespace

import pytest

from scripts.run_with_secrets import load_file_secrets
from src.operations import tasks as operations_tasks


class _FakeChannel:
    def __init__(self):
        self.closed = False

    def queue_declare(self, queue, passive):
        assert passive is True
        return SimpleNamespace(message_count=len(queue), consumer_count=1)

    def close(self):
        self.closed = True


class _FakeConnection:
    def __init__(self):
        self.channel_instance = _FakeChannel()

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return None

    def channel(self):
        return self.channel_instance


def test_queue_depths_reports_all_declared_queues(monkeypatch):
    connection = _FakeConnection()
    monkeypatch.setattr(operations_tasks.celery_app, "connection_for_read", lambda: connection)

    snapshot = operations_tasks.queue_depths()

    assert set(snapshot) == {"ingest", "maintenance", "quarantine"}
    assert snapshot["ingest"] == {"mensagens": 6, "consumidores": 1}
    assert connection.channel_instance.closed is True


def test_load_file_secrets_reads_values_without_exposing_paths(tmp_path: Path):
    secret = tmp_path / "rabbitmq-url"
    secret.write_text("amqp://user:password@rabbitmq//\n", encoding="utf-8")
    environ = {"RABBITMQ_URL_FILE": str(secret)}

    loaded = load_file_secrets(environ)

    assert loaded == {"RABBITMQ_URL": "amqp://user:password@rabbitmq//"}
    assert environ["RABBITMQ_URL"] == loaded["RABBITMQ_URL"]


def test_load_file_secrets_rejects_ambiguous_configuration(tmp_path: Path):
    secret = tmp_path / "jwt"
    secret.write_text("secret", encoding="utf-8")

    with pytest.raises(RuntimeError, match="nunca ambos"):
        load_file_secrets({"JWT_SECRET": "inline", "JWT_SECRET_FILE": str(secret)})


def test_production_stack_materializes_all_roles_and_body_limit():
    stack = (Path(__file__).parents[2] / "stack.production.example.yml").read_text(encoding="utf-8")
    for service in (
        "migrate:",
        "seed:",
        "api:",
        "worker-ingest:",
        "worker-maintenance:",
        "worker-quarantine:",
        "beat:",
    ):
        assert f"  {service}" in stack
    assert "maxRequestBodyBytes=10485760" in stack
    assert "order: stop-first" in stack
    assert "--require\n      - dataset" in stack
