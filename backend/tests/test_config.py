import pytest
from pydantic import ValidationError

from src.config import Settings


def test_settings_loads_from_env_vars(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://u:p@localhost:5432/db")
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")
    monkeypatch.setenv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672//")
    monkeypatch.setenv("JWT_SECRET", "test-secret")

    settings = Settings(_env_file=None)

    assert settings.database_url == "postgresql+asyncpg://u:p@localhost:5432/db"
    assert settings.redis_url == "redis://localhost:6379/0"
    assert settings.rabbitmq_url == "amqp://guest:guest@localhost:5672//"
    assert settings.jwt_secret == "test-secret"
    assert settings.environment == "development"
    assert settings.jwt_lifetime_seconds == 3600


def test_settings_fails_when_required_var_missing(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")
    monkeypatch.setenv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672//")
    monkeypatch.setenv("JWT_SECRET", "test-secret")

    with pytest.raises(ValidationError):
        Settings(_env_file=None)
