from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel


class LadoDoLivro(BaseModel):
    """Um lado do livro de ofertas — venda (`offer`) ou compra (`request`). São universos de
    preço separados (achado C3: no algodão T2 real, venda ficou 37-39 e compra 1-35 — nunca
    devem se misturar num preço só)."""

    preco: Decimal | None = None  # menor preço de venda, ou maior preço de compra
    total_unidades: int = 0
    qtd_ordens: int = 0


class VolumeVendido(BaseModel):
    """Giro real nas últimas 24h, vindo de `markethistories.ingest` (preço realmente
    transacionado — diferente do que alguém está pedindo no livro)."""

    unidades: int
    preco_medio: Decimal | None = None


class PrecoPorLocal(BaseModel):
    location_id: str
    quality_level: int
    enchantment_level: int
    venda: LadoDoLivro
    compra: LadoDoLivro
    vendido_24h: VolumeVendido | None = None
    # last_seen_at mais recente do livro pra essa combinação — reflete a idade do dado mesmo
    # quando a profundidade zerou por estar fora da janela de frescor (task 29).
    varredura_em: datetime | None = None


class ItemPricesOut(BaseModel):
    item_id: str
    scope: str  # "all" | "mine"
    prices: list[PrecoPorLocal]


class ItemResumo(BaseModel):
    unique_name: str
    nome: str | None = None


class LivroOut(BaseModel):
    venda: LadoDoLivro
    compra: LadoDoLivro
    varredura_em: datetime | None = None


class VendidoOut(BaseModel):
    ultimas_24h: VolumeVendido
    ultimos_7d: VolumeVendido
    ultimos_30d: VolumeVendido


class PontoSerie6h(BaseModel):
    inicio: datetime
    unidades: int
    preco_medio: Decimal | None = None


class DemandOut(BaseModel):
    """Task 31 — responde "quanta gente está comprando isso agora": `livro` é demanda
    parada esperando no livro de ofertas, `vendido` é giro real transacionado em 3 janelas,
    `serie_6h` é a série bruta pra quem quiser plotar tendência."""

    item: ItemResumo
    location_id: str
    livro: LivroOut
    vendido: VendidoOut
    serie_6h: list[PontoSerie6h]
