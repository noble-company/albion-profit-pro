import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Index,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from src.database import Base


class RecipeRanking(Base):
    """Ranking de produção pré-calculado — uma linha por (realm, receita, cidade, qualidade).

    Guarda os **componentes** do resultado em parâmetros neutros (``return_rate=0``,
    ``station_cost=0``, sem imposto nem setup fee), não só o número final. Premium, retorno,
    estação e taxas são aplicados na leitura (projeção barata) ou no cliente (task 23).

    ``neutral_profit`` / ``neutral_roi`` são a base de ordenação e dos filtros ``min_profit`` /
    ``min_roi`` da UI, materializados para leitura indexada. São ``NULL`` quando o cenário
    imediato/imediato não pôde ser precificado — essas linhas existem para a contagem de
    cobertura e aparecem depois das precificadas.
    """

    __tablename__ = "recipe_ranking"
    __table_args__ = (
        CheckConstraint("server_id IN ('west', 'east', 'europe')", name="ck_recipe_ranking_server"),
        CheckConstraint("output_quality BETWEEN 1 AND 5", name="ck_recipe_ranking_quality"),
        UniqueConstraint(
            "server_id",
            "output_item_unique_name",
            "location_id",
            "output_quality",
            name="uq_recipe_ranking",
        ),
        Index(
            "ix_recipe_ranking_order",
            "server_id",
            "is_refining",
            "neutral_profit",
        ),
        Index(
            "ix_recipe_ranking_filters",
            "server_id",
            "is_refining",
            "tier",
            "enchantment_level",
            "output_quality",
        ),
        Index(
            "ix_recipe_ranking_location",
            "server_id",
            "is_refining",
            "location_id",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    server_id: Mapped[str] = mapped_column(String(16))
    output_item_unique_name: Mapped[str] = mapped_column(String(64))
    location_id: Mapped[str] = mapped_column(String(64))
    output_quality: Mapped[int]

    enchantment_level: Mapped[int] = mapped_column(default=0)
    tier: Mapped[int | None] = mapped_column(nullable=True)
    is_refining: Mapped[bool] = mapped_column(Boolean)

    # Constantes da receita (por execução) e produção para quantidade solicitada = 1.
    recipe_silver_cost: Mapped[int] = mapped_column(default=0)
    crafting_focus: Mapped[int] = mapped_column(default=0)
    amount_crafted: Mapped[int] = mapped_column(default=1)
    executions: Mapped[int] = mapped_column(default=1)
    produced_quantity: Mapped[int] = mapped_column(default=1)

    # Componentes neutros para ``produced_quantity`` unidades. NULL = lado não precificável.
    ingredient_cost_immediate: Mapped[float | None] = mapped_column(Numeric(18, 4), nullable=True)
    ingredient_cost_order: Mapped[float | None] = mapped_column(Numeric(18, 4), nullable=True)
    output_gross_immediate: Mapped[float | None] = mapped_column(Numeric(18, 4), nullable=True)
    output_gross_order: Mapped[float | None] = mapped_column(Numeric(18, 4), nullable=True)

    # Lista neutra (return_rate=0) para a UI do ranking: {item, item_name, gross_quantity,
    # expected_return_quantity, purchase_quantity}. O detalhe exato é POST /craft/simulate.
    ingredients: Mapped[list] = mapped_column(JSONB, default=list)

    ingredients_oldest_observed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    output_immediate_observed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    output_order_observed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    warnings: Mapped[list] = mapped_column(JSONB, default=list)

    # Base de ordenação/filtro: imediato/imediato, sem imposto, retorno ou estação.
    neutral_profit: Mapped[float | None] = mapped_column(Numeric(18, 4), nullable=True)
    neutral_roi: Mapped[float | None] = mapped_column(Numeric(18, 4), nullable=True)

    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class RecipeRankingRun(Base):
    """Uma linha por realm com a cobertura da última reconstrução do ranking.

    Alimenta o bloco ``coverage`` do payload para que a UI nunca esconda truncamento.
    """

    __tablename__ = "recipe_ranking_run"
    __table_args__ = (
        CheckConstraint(
            "server_id IN ('west', 'east', 'europe')", name="ck_recipe_ranking_run_server"
        ),
        UniqueConstraint("server_id", name="uq_recipe_ranking_run_server"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    server_id: Mapped[str] = mapped_column(String(16))
    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    duration_ms: Mapped[int] = mapped_column(default=0)
    evaluated_recipes: Mapped[int] = mapped_column(default=0)
    priced_recipes: Mapped[int] = mapped_column(default=0)
    total_recipes: Mapped[int] = mapped_column(default=0)
    ranking_rows: Mapped[int] = mapped_column(default=0)
