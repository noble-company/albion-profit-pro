import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from src.database import Base


class MarketOrder(Base):
    """Estado atual do livro de ofertas: uma linha por leilão do jogo (`source_id`), não um
    log de varreduras. O client reenvia o livro inteiro toda vez que o jogador abre o
    mercado — sem upsert por `source_id` a tabela cresce sem limite com cópias da mesma
    oferta parada. Sem `user_id`/`is_public` de propósito: procedência por usuário fica na
    tabela de cobertura. Ver docs/03-contrato-ingest-real.md, seção 5."""

    __tablename__ = "market_order"
    __table_args__ = (
        CheckConstraint("server_id IN ('west', 'east', 'europe')", name="ck_market_order_server"),
        CheckConstraint("source_id > 0", name="ck_market_order_source_positive"),
        CheckConstraint("length(item_id) > 0", name="ck_market_order_item_not_empty"),
        CheckConstraint("length(location_id) > 0", name="ck_market_order_location_not_empty"),
        CheckConstraint("quality_level BETWEEN 1 AND 5", name="ck_market_order_quality"),
        CheckConstraint("enchantment_level BETWEEN 0 AND 4", name="ck_market_order_enchantment"),
        CheckConstraint("unit_price_silver > 0", name="ck_market_order_price_positive"),
        CheckConstraint("amount > 0", name="ck_market_order_amount_positive"),
        CheckConstraint(
            "auction_type IN ('offer', 'request')", name="ck_market_order_auction_type"
        ),
        UniqueConstraint("server_id", "source_id", name="uq_market_order_source"),
        Index(
            "ix_market_order_book",
            "server_id",
            "item_id",
            "location_id",
            "quality_level",
            "auction_type",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    server_id: Mapped[str] = mapped_column(String(16))
    # campo "Id" do JSON — id do leilao no jogo, estavel dentro de cada servidor.
    source_id: Mapped[int] = mapped_column(BigInteger)

    item_id: Mapped[str] = mapped_column(String(64), index=True)  # ItemTypeId
    group_type_id: Mapped[str] = mapped_column(String(64))  # ItemGroupTypeId
    location_id: Mapped[str] = mapped_column(String(64), index=True)  # LocationId
    quality_level: Mapped[int]  # QualityLevel
    enchantment_level: Mapped[int]  # EnchantmentLevel
    # UnitPriceSilver — já convertido do wire (que vem x10.000, ver
    # docs/03-contrato-ingest-real.md secao 1 / src/ingest/normalize.py) pro valor real em silver
    unit_price_silver: Mapped[Decimal] = mapped_column(Numeric(18, 4))
    amount: Mapped[int]  # Amount
    auction_type: Mapped[str] = mapped_column(String(16))  # AuctionType ("offer"/"request")
    # Expires — já convertido de string ISO (precisão variável, sem timezone) pra datetime aware
    expires: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    first_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )


class MarketHistoryEntry(Base):
    """Tabela-fato global do histórico de mercado: uma linha por (item, local, qualidade,
    tamanho de bucket, início do bucket). O histórico é autoritativo do servidor do jogo —
    não há `user_id` aqui de propósito, N usuários coletando o mesmo bucket não duplicam a
    linha; procedência por usuário é resolvida pela tabela de cobertura. Ver
    docs/03-contrato-ingest-real.md, seção 3."""

    __tablename__ = "market_history_entry"
    __table_args__ = (
        CheckConstraint(
            "server_id IN ('west', 'east', 'europe')", name="ck_market_history_entry_server"
        ),
        CheckConstraint("item_id > 0", name="ck_market_history_entry_item_positive"),
        CheckConstraint(
            "length(location_id) > 0", name="ck_market_history_entry_location_not_empty"
        ),
        CheckConstraint("quality_level BETWEEN 1 AND 5", name="ck_market_history_entry_quality"),
        CheckConstraint(
            "bucket_seconds IN (3600, 21600)", name="ck_market_history_entry_bucket_seconds"
        ),
        CheckConstraint("item_amount >= 0", name="ck_market_history_entry_amount_nonnegative"),
        CheckConstraint("silver_amount >= 0", name="ck_market_history_entry_silver_nonnegative"),
        UniqueConstraint(
            "server_id",
            "item_id",
            "location_id",
            "quality_level",
            "bucket_seconds",
            "bucket_start",
            name="uq_market_history_bucket",
        ),
        Index(
            "ix_market_history_lookup",
            "server_id",
            "item_id",
            "location_id",
            "quality_level",
            "bucket_seconds",
            "bucket_start",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    server_id: Mapped[str] = mapped_column(String(16))

    item_id: Mapped[int] = mapped_column(
        BigInteger, index=True
    )  # AlbionId (int32 no Go, aqui BigInteger por folga)
    location_id: Mapped[str] = mapped_column(String(64), index=True)  # LocationId
    quality_level: Mapped[int]  # QualityLevel (uint8 no Go)

    # 3600 (Timescale=0) ou 21600 (Timescale=1 e 2, que colapsam de proposito — ver
    # docs/03-contrato-ingest-real.md secao 3 e src/ingest/normalize.py). Substitui a antiga
    # coluna `timescale`, que descrevia como perguntamos, nao o que o dado e.
    bucket_seconds: Mapped[int]
    bucket_start: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    item_amount: Mapped[int] = mapped_column(BigInteger)  # ItemAmount
    # SilverAmount — já convertido do wire (x10.000) pro total real em silver do bucket
    silver_amount: Mapped[Decimal] = mapped_column(Numeric(20, 4))

    first_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class MarketScan(Base):
    """Procedência por usuário sem amarrar `user_id` às tabelas-fato, que são
    globais, ver `MarketOrder`/`MarketHistoryEntry` acima) — em vez disso registra que um
    usuário varreu um (item, local, qualidade), independente de quantas ordens/buckets essa
    varredura tocou. `scope=mine` vira um EXISTS contra esta tabela, não um filtro na
    linha do fato. Ver docs/tasks/backend/30-cobertura-por-usuario-e-escopo.md."""

    __tablename__ = "market_scan"
    __table_args__ = (
        CheckConstraint("server_id IN ('west', 'east', 'europe')", name="ck_market_scan_server"),
        CheckConstraint("length(item_key) > 0", name="ck_market_scan_item_not_empty"),
        CheckConstraint("length(location_id) > 0", name="ck_market_scan_location_not_empty"),
        CheckConstraint("quality_level BETWEEN 1 AND 5", name="ck_market_scan_quality"),
        CheckConstraint("fonte IN ('livro', 'historico')", name="ck_market_scan_fonte"),
        UniqueConstraint(
            "server_id",
            "user_id",
            "item_key",
            "location_id",
            "quality_level",
            "fonte",
            name="uq_market_scan",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    server_id: Mapped[str] = mapped_column(String(16))
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id"), index=True)

    # O histórico resolve AlbionId -> unique_name antes de gravar, para manter uma identidade
    # única; o ingest de
    # livro já recebe o unique_name direto (ItemTypeId).
    item_key: Mapped[str] = mapped_column(String(64), index=True)
    location_id: Mapped[str] = mapped_column(String(64))
    quality_level: Mapped[int]
    fonte: Mapped[str] = mapped_column(String(16))  # "livro" | "historico"

    primeira_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    ultima_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    n_varreduras: Mapped[int] = mapped_column(default=1)


class MarketHistoryDaily(Base):
    """Rollup diário de `market_history_entry`: uma linha por (item, local,
    qualidade, dia), alimentada exclusivamente pelos buckets de 6h (`bucket_seconds=21600`)
    — os de 1h só existem pra visão em tempo real de "últimas 24h" e são podados em 48h,
    então nunca entram no rollup (evita contar a mesma transação duas vezes em duas
    granularidades). `preco_medio` é média ponderada por volume (sum(silver)/sum(amount)),
    nunca média das médias. PK surrogate (uuid) + UniqueConstraint, pelo mesmo padrão das
    outras tabelas deste módulo — a spec original descreve PK composta, mas isso quebraria a
    convenção do resto do arquivo sem ganho real."""

    __tablename__ = "market_history_daily"
    __table_args__ = (
        CheckConstraint(
            "server_id IN ('west', 'east', 'europe')", name="ck_market_history_daily_server"
        ),
        UniqueConstraint(
            "server_id",
            "item_id",
            "location_id",
            "quality_level",
            "dia",
            name="uq_market_history_daily",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    server_id: Mapped[str] = mapped_column(String(16))
    item_id: Mapped[int] = mapped_column(BigInteger, index=True)  # AlbionId
    location_id: Mapped[str] = mapped_column(String(64), index=True)
    quality_level: Mapped[int]
    dia: Mapped[date] = mapped_column(Date, index=True)

    item_amount: Mapped[int] = mapped_column(BigInteger)
    silver_amount: Mapped[Decimal] = mapped_column(Numeric(20, 4))
    preco_medio: Mapped[Decimal] = mapped_column(Numeric(18, 4))


class MarketHistoryMonthly(Base):
    """Rollup mensal de `market_history_daily`, base para previsão de preço de
    médio prazo. `mes` é sempre o primeiro dia do mês. Mesma semântica de `preco_medio` de
    `MarketHistoryDaily`."""

    __tablename__ = "market_history_monthly"
    __table_args__ = (
        CheckConstraint(
            "server_id IN ('west', 'east', 'europe')", name="ck_market_history_monthly_server"
        ),
        UniqueConstraint(
            "server_id",
            "item_id",
            "location_id",
            "quality_level",
            "mes",
            name="uq_market_history_monthly",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    server_id: Mapped[str] = mapped_column(String(16))
    item_id: Mapped[int] = mapped_column(BigInteger, index=True)  # AlbionId
    location_id: Mapped[str] = mapped_column(String(64), index=True)
    quality_level: Mapped[int]
    mes: Mapped[date] = mapped_column(Date, index=True)

    item_amount: Mapped[int] = mapped_column(BigInteger)
    silver_amount: Mapped[Decimal] = mapped_column(Numeric(20, 4))
    preco_medio: Mapped[Decimal] = mapped_column(Numeric(18, 4))
