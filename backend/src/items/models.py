from decimal import Decimal

from sqlalchemy import BigInteger, Boolean, Numeric, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from src.database import Base


class Item(Base):
    """Ponte entre os dois identificadores que o jogo usa pro mesmo item: `ItemTypeId`
    (string, usado por `marketorders.ingest`) e `AlbionId`/`Index` (int, usado por
    `markethistories.ingest`). Sem essa tabela não dá pra juntar histórico com preço nem com
    receita pra matéria-prima não craftável. Populada por
    `scripts/import_items.py` a partir de `items.json` (+ tier/categoria do `ITEM DUMP.json`).
    """

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
    shop_subcategory2: Mapped[str | None] = mapped_column(String(64))
    shop_subcategory3: Mapped[str | None] = mapped_column(String(64))
    # `@craftingcategory` do ITEM DUMP — o ramo do Painel do Destino (task 4/17). `T5_CLOTH`
    # tem "fiber", `T5_MAIN_CURSEDSTAFF` tem "cursestaff". É a chave que liga um item ao nó de
    # especialização que reduz o custo de foco dele. Nulo pra item que não se fabrica.
    crafting_category: Mapped[str | None] = mapped_column(String(64))
    # Peso em kg do ITEM DUMP (`@weight`), fonte do "lucro por peso" do scanner (task 4/01).
    # Decimal, não float: entra na divisão `lucro / peso`, cujo resultado o usuário lê — a
    # regra F09 vale pra toda aritmética exibida. Nulo pra item sem `@weight` no dump.
    weight: Mapped[Decimal | None] = mapped_column(Numeric(10, 4))
    # Valor do item (`@itemvalue` do dump, ou derivado da receita quando o dump não publica —
    # ver `scripts/_item_values.py`). É a base da taxa da estação: o jogo cobra por nutrição
    # consumida, e `nutrição = item_value × 0,1125` (task 4/18). Nulo para item cuja cadeia de
    # receita não resolve — os trade packs de facção, feitos de token sem valor.
    item_value: Mapped[Decimal | None] = mapped_column(Numeric(14, 4))
    busca_normalizada: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("''"))


class Location(Base):
    """Preenchida oportunisticamente pelo ingest (não por uma lista curada): toda
    `location_id` que aparecer em `marketorders.ingest`/`markethistories.ingest` vira uma
    linha aqui, com `kind` inferido do formato. Uma lista curada de cidades reais pode
    sobrescrever `name`/`is_royal_city` depois — o ingest nunca falha por localização
    desconhecida (`"1000-HellDen"`, por exemplo, não é um código numérico de 4 dígitos)."""

    __tablename__ = "location"

    location_id: Mapped[str] = mapped_column(String(64), primary_key=True)  # "1002", "1000-HellDen"
    name: Mapped[str | None] = mapped_column(String(128))
    kind: Mapped[str] = mapped_column(String(32))  # "city" | "hell_den" | "rest" | "desconhecido"
    is_royal_city: Mapped[bool] = mapped_column(Boolean, default=False)
