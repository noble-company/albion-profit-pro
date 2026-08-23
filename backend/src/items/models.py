from sqlalchemy import BigInteger, Boolean, String
from sqlalchemy.orm import Mapped, mapped_column

from src.database import Base


class Item(Base):
    """Ponte entre os dois identificadores que o jogo usa pro mesmo item: `ItemTypeId`
    (string, usado por `marketorders.ingest`) e `AlbionId`/`Index` (int, usado por
    `markethistories.ingest`). Sem essa tabela não dá pra juntar histórico com preço nem com
    receita pra matéria-prima não craftável (achado N3). Populada por
    `scripts/import_items.py` a partir de `items.json` (+ tier/categoria do `ITEM DUMP.json`).
    Ver task 28."""

    __tablename__ = "item"

    # UniqueName exato do items.json — já inclui o sufixo "@N" pra variantes encantadas
    # (ex: "T4_HEAD_CLOTH_SET1@1"), mesma convenção usada em Recipe.output_item_unique_name.
    unique_name: Mapped[str] = mapped_column(String(64), primary_key=True)
    albion_id: Mapped[int | None] = mapped_column(BigInteger, unique=True, index=True)  # Index
    name_pt: Mapped[str | None] = mapped_column(String(255))
    name_en: Mapped[str | None] = mapped_column(String(255))
    tier: Mapped[int | None]
    # Derivado do sufixo "@N" do unique_name (0 se não tiver) — não vem do items.json direto.
    enchantment_level: Mapped[int] = mapped_column(default=0)
    shop_category: Mapped[str | None] = mapped_column(String(64))
    shop_subcategory: Mapped[str | None] = mapped_column(String(64))


class Location(Base):
    """Preenchida oportunisticamente pelo ingest (não por uma lista curada): toda
    `location_id` que aparecer em `marketorders.ingest`/`markethistories.ingest` vira uma
    linha aqui, com `kind` inferido do formato. Uma lista curada de cidades reais pode
    sobrescrever `name`/`is_royal_city` depois — o ingest nunca falha por localização
    desconhecida (achado N3: `"1000-HellDen"` não é o código numérico de 4 dígitos que a
    lista antiga em `src/prices/service.py` assumia). Ver task 28."""

    __tablename__ = "location"

    location_id: Mapped[str] = mapped_column(String(64), primary_key=True)  # "1002", "1000-HellDen"
    name: Mapped[str | None] = mapped_column(String(128))
    kind: Mapped[str] = mapped_column(String(32))  # "city" | "hell_den" | "rest" | "desconhecido"
    is_royal_city: Mapped[bool] = mapped_column(Boolean, default=False)
