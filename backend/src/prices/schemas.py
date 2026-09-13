from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel

from src.prices.constants import AlbionServer


class BookSide(BaseModel):
    """One side of the order book — ``sell`` (game ``offer``, the ask) or ``buy`` (game
    ``request``, the bid). Separate price universes: in real T2 cotton the sell side sat at
    37-39 and the buy side at 1-35 — they must never be collapsed into a single price."""

    best_price: Decimal | None = None
    observed_units: int = 0
    observed_orders: int = 0
    observed_at: datetime | None = None
    age_seconds: int | None = None


class SoldVolume(BaseModel):
    """Real turnover, from ``markethistories.ingest`` — the price actually transacted, not what
    someone is asking for in the book."""

    units: int
    average_price: Decimal | None = None


class LocationPrice(BaseModel):
    location_id: str
    quality_level: int
    enchantment_level: int
    sell: BookSide
    buy: BookSide
    sold_24h: SoldVolume | None = None
    coverage: Literal["parcial"]
    freshness_window_seconds: int


class ItemPricesOut(BaseModel):
    """Global partial observations, or the combinations covered by the user, per ``scope``.

    Under ``mine`` the book coverage and the history coverage are independent.
    """

    server: AlbionServer
    item_id: str
    scope: Literal["all", "mine"]
    prices: list[LocationPrice]
    total: int
    limit: int
    offset: int


class ItemSummary(BaseModel):
    unique_name: str
    name: str | None = None


class BookOut(BaseModel):
    sell: BookSide
    buy: BookSide
    coverage: Literal["parcial"]
    freshness_window_seconds: int


class SoldOut(BaseModel):
    last_24h: SoldVolume
    last_7d: SoldVolume
    last_30d: SoldVolume


class Series6hPoint(BaseModel):
    start: datetime
    units: int
    average_price: Decimal | None = None


class DemandOut(BaseModel):
    """Answers "how many people are buying this right now": ``book`` is demand parked in the
    request side of the order book, ``sold`` is real turnover over three windows, ``series_6h``
    is the raw series for plotting a trend. The view is global and does not inherit the
    ``scope`` of the prices endpoint."""

    server: AlbionServer
    item: ItemSummary
    location_id: str
    book: BookOut
    sold: SoldOut
    series_6h: list[Series6hPoint]


class PriceSnapshotColumnsOut(BaseModel):
    """Arrays paralelos: o índice `i` de cada array descreve a mesma linha.

    ``item`` e ``location`` são **índices** em ``PriceSnapshotOut.items`` / ``.locations``;
    ``sell_source``/``buy_source`` são índices em ``.sources``. Os ``observed_at`` são **epoch
    em segundos** (inteiro), não ISO — ISO custa 29 caracteres por lado, por linha.

    ``null`` em qualquer lado significa **ausência de preço**, nunca preço zero.
    """

    item: list[int]
    location: list[int]
    quality: list[int]
    enchantment: list[int]

    # Menor `offer`: o que o jogador paga para comprar agora.
    sell_min: list[str | None]
    sell_observed_at: list[int | None]
    sell_source: list[int | None]

    # Maior `request`: o que o jogador recebe vendendo agora.
    buy_max: list[str | None]
    buy_observed_at: list[int | None]
    buy_source: list[int | None]


class PriceSnapshotOut(BaseModel):
    """Snapshot de um realm. **Sem filtro de frescor e sem paginação** — a idade viaja em cada
    linha e quem decide o que esconder é a tela (`X02`).

    **Formato colunar, por medição.** A versão legível (array de objetos) custou 23 B/linha
    gzipped, o que extrapola para ~67 KB numa cidade e ~560 KB nas oito — caro demais para algo
    que o cliente busca a cada 30 s. Trocar chaves repetidas por arrays, strings por índices de
    dicionário e ISO por epoch resolve isso. Os números medidos estão no estado da task 4/03.

    Preço continua **string decimal** (`F09`) — a compactação não passa por cima da regra do
    dinheiro.
    """

    server: AlbionServer
    generated_at: datetime
    row_count: int

    # Dicionários: o payload referencia por índice.
    items: list[str]
    locations: list[str]
    sources: list[str]

    columns: PriceSnapshotColumnsOut


class SalesColumnsOut(BaseModel):
    """Arrays paralelos, como o snapshot: o índice `i` de cada array descreve a mesma linha.

    ``units_per_day`` é a média de unidades vendidas por dia na janela, e ``average_price`` o preço
    médio ponderado pelo volume — os dois como string decimal (`F09`). ``days_with_data`` diz em
    quantos dias da janela houve venda: a média é sobre a janela inteira, não sobre esses dias.
    """

    item: list[int]
    location: list[int]
    quality: list[int]
    units_per_day: list[str]
    average_price: list[str | None]
    days_with_data: list[int]


class SalesOut(BaseModel):
    """Unidades vendidas por dia (task 4/23). Item sem histórico **fica ausente** — nunca zero,
    que afirmaria que ninguém compra."""

    server: AlbionServer
    days: int
    row_count: int
    items: list[str]
    locations: list[str]
    columns: SalesColumnsOut
