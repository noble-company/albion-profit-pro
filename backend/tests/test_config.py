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
    assert settings.trusted_proxy_cidrs == []


def test_settings_fails_when_required_var_missing(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")
    monkeypatch.setenv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672//")
    monkeypatch.setenv("JWT_SECRET", "test-secret")

    with pytest.raises(ValidationError):
        Settings(_env_file=None)


@pytest.mark.parametrize("value", ['["nao-e-cidr"]', '["0.0.0.0/0"]', '["::/0"]'])
def test_settings_rejects_trusted_proxy_inseguro(monkeypatch, value):
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://u:p@localhost:5432/db")
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")
    monkeypatch.setenv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672//")
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    monkeypatch.setenv("TRUSTED_PROXY_CIDRS", value)

    with pytest.raises(ValidationError):
        Settings(_env_file=None)


def _base_env(monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://u:p@localhost:5432/db")
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")
    monkeypatch.setenv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672//")
    monkeypatch.setenv("JWT_SECRET", "test-secret")


@pytest.mark.parametrize("value", ['["*"]', '["app.exemplo.com"]', '["localhost:5173"]'])
def test_settings_rejects_unsafe_cors_origins_outside_development(monkeypatch, value):
    _base_env(monkeypatch)
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("CORS_ORIGINS", value)

    with pytest.raises(ValidationError):
        Settings(_env_file=None)


def test_settings_allows_full_origin_in_production(monkeypatch):
    _base_env(monkeypatch)
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("CORS_ORIGINS", '["https://app.exemplo.com"]')

    settings = Settings(_env_file=None)
    assert settings.cors_origins == ["https://app.exemplo.com"]


def test_settings_allows_wildcard_cors_in_development(monkeypatch):
    _base_env(monkeypatch)
    monkeypatch.setenv("CORS_ORIGINS", '["*"]')

    settings = Settings(_env_file=None)
    assert settings.cors_origins == ["*"]
