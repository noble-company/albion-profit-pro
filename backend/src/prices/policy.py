from dataclasses import dataclass
from datetime import timedelta
from typing import Literal

from src.config import get_settings


@dataclass(frozen=True, slots=True)
class MarketBookPolicy:
    """Política única do livro observado, compartilhada por ingest e leitura."""

    freshness: timedelta
    coverage: Literal["partial"] = "partial"

    @property
    def freshness_hours(self) -> int:
        return int(self.freshness.total_seconds() // 3600)

    @property
    def freshness_seconds(self) -> int:
        return int(self.freshness.total_seconds())


def get_market_book_policy() -> MarketBookPolicy:
    settings = get_settings()
    return MarketBookPolicy(freshness=timedelta(hours=settings.price_freshness_hours))
