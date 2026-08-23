from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    environment: str = "development"

    # Postgres
    database_url: str  # postgresql+asyncpg://user:pass@host:5432/dbname

    # Redis
    redis_url: str  # redis://host:6379/0

    # RabbitMQ (broker do Celery)
    rabbitmq_url: str  # amqp://user:pass@host:5672//

    # Auth (fastapi-users)
    jwt_secret: str
    jwt_lifetime_seconds: int = 3600
    # Secrets dos fluxos de reset de senha / verificação de e-mail (task 33) — antes
    # reusavam jwt_secret. Opcionais com fallback pra ele via as properties abaixo, pra não
    # exigir uma env var nova em ambiente já rodando; setar em produção pra rotacionar
    # independente do JWT de sessão.
    reset_password_token_secret: str | None = None
    verification_token_secret: str | None = None

    # CORS (frontend)
    cors_origins: list[str] = ["http://localhost:5173"]

    # Preços — janela de frescor pra profundidade do livro (task 29). Ordem vista há mais
    # tempo que isso não conta como oferta viva, mesmo sem estar expirada — decisão de
    # produto, default proposto (ver docs/tasks/backend/29-precos-por-lado-e-profundidade.md).
    price_freshness_hours: int = 6

    @property
    def reset_password_secret(self) -> str:
        return self.reset_password_token_secret or self.jwt_secret

    @property
    def verification_secret(self) -> str:
        return self.verification_token_secret or self.jwt_secret


@lru_cache
def get_settings() -> Settings:
    return Settings()
