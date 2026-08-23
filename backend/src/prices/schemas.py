from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel

from src.prices.constants import AlbionServer


class LadoDoLivro(BaseModel):
    """Um lado do livro de ofertas — venda (`offer`) ou compra (`request`). São universos de
    preço separados (no algodão T2 real, venda ficou 37-39 e compra 1-35 — nunca
    devem se misturar num preço só)."""

    melhor_preco: Decimal | None = None
    unidades_observadas: int = 0
    ordens_observadas: int = 0
    observado_em: datetime | None = None
    idade_segundos: int | None = None


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
    cobertura: Literal["parcial"]
    janela_frescor_segundos: int


class ItemPricesOut(BaseModel):
    """Preços globais ou combinações cobertas pelo usuário, conforme `scope`.

    Em `mine`, a cobertura de livro e a de histórico são independentes.
    """

    server: AlbionServer
    item_id: str
    scope: Literal["all", "mine"]
    prices: list[PrecoPorLocal]
    total: int
    limit: int
    offset: int


class ItemResumo(BaseModel):
    unique_name: str
    nome: str | None = None


class LivroOut(BaseModel):
    venda: LadoDoLivro
    compra: LadoDoLivro
    cobertura: Literal["parcial"]
    janela_frescor_segundos: int


class VendidoOut(BaseModel):
    ultimas_24h: VolumeVendido
    ultimos_7d: VolumeVendido
    ultimos_30d: VolumeVendido


class PontoSerie6h(BaseModel):
    inicio: datetime
    unidades: int
    preco_medio: Decimal | None = None


class DemandOut(BaseModel):
    """Responde "quanta gente está comprando isso agora": `livro` é demanda
    parada esperando no livro de ofertas, `vendido` é giro real transacionado em 3 janelas,
    `serie_6h` é a série bruta pra quem quiser plotar tendência. A visão é global e não
    herda o `scope` do endpoint de preços."""

    server: AlbionServer
    item: ItemResumo
    location_id: str
    livro: LivroOut
    vendido: VendidoOut
    serie_6h: list[PontoSerie6h]
