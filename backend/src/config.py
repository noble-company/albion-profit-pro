from functools import lru_cache
from ipaddress import ip_network

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    environment: str = "development"

    # Postgres
    database_url: str  # postgresql+asyncpg://user:pass@host:5432/dbname

    # Redis
    redis_url: str  # redis://host:6379/0

    # So peers nestas redes podem fornecer X-Forwarded-For. Em producao deve conter apenas
    # a rede/enderecos do Traefik; vazio por default e seguro para acesso direto.
    trusted_proxy_cidrs: list[str] = Field(default_factory=list)

    # RabbitMQ (broker do Celery)
    rabbitmq_url: str  # amqp://user:pass@host:5672//

    # Auth (fastapi-users)
    jwt_secret: str
    jwt_lifetime_seconds: int = 3600
    # Secrets de reset de senha e verificação podem ser rotacionados sem invalidar sessões.
    # São opcionais com fallback para jwt_secret, para não quebrar ambientes existentes;
    # exigir uma env var nova em ambiente já rodando; setar em produção pra rotacionar
    # independente do JWT de sessão.
    reset_password_token_secret: str | None = None
    verification_token_secret: str | None = None

    # CORS (frontend)
    cors_origins: list[str] = ["http://localhost:5173"]

    # Ordem vista há mais
    # tempo que isso não conta como oferta viva, mesmo sem estar expirada — decisão de
    # produto, default proposto (ver docs/tasks/backend/29-precos-por-lado-e-profundidade.md).
    price_freshness_hours: int = 6

    @field_validator("trusted_proxy_cidrs")
    @classmethod
    def validate_trusted_proxy_cidrs(cls, values: list[str]) -> list[str]:
        for value in values:
            network = ip_network(value, strict=False)
            if network.prefixlen == 0:
                raise ValueError("trusted_proxy_cidrs nao pode confiar em toda a Internet")
        return values

    @property
    def reset_password_secret(self) -> str:
        return self.reset_password_token_secret or self.jwt_secret

    @property
    def verification_secret(self) -> str:
        return self.verification_token_secret or self.jwt_secret


@lru_cache
def get_settings() -> Settings:
    return Settings()
