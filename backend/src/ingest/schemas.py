from pydantic import BaseModel, Field


class MarketOrderIn(BaseModel):
    id: int = Field(alias="Id")
    item_id: str = Field(alias="ItemTypeId")
    group_type_id: str = Field(alias="ItemGroupTypeId")
    location_id: str = Field(alias="LocationId")
    quality_level: int = Field(alias="QualityLevel")
    enchantment_level: int = Field(alias="EnchantmentLevel")
    unit_price_silver: int = Field(alias="UnitPriceSilver")
    amount: int = Field(alias="Amount")
    auction_type: str = Field(alias="AuctionType")
    expires: str = Field(alias="Expires")

    model_config = {"populate_by_name": True}


# Teto de lista (task 33, achado A6): a captura real mostra lotes de ~50 ordens; 5000 é
# folgado e ainda protege o broker de um client defeituoso (ou hostil, com token válido)
# mandando um payload gigante. Vale pra toda lista de ingest, não só `orders` — o mesmo
# risco existe em qualquer campo sem teto.
MAX_ITENS_POR_LOTE = 5000


class MarketUploadIn(BaseModel):
    orders: list[MarketOrderIn] = Field(alias="Orders", max_length=MAX_ITENS_POR_LOTE)

    model_config = {"populate_by_name": True}


class MarketHistoryEntryIn(BaseModel):
    item_amount: int = Field(alias="ItemAmount")
    silver_amount: int = Field(alias="SilverAmount")
    timestamp: int = Field(alias="Timestamp")

    model_config = {"populate_by_name": True}


class MarketHistoriesUploadIn(BaseModel):
    albion_id: int = Field(alias="AlbionId")
    location_id: str = Field(alias="LocationId")
    quality_level: int = Field(alias="QualityLevel")
    timescale: int = Field(alias="Timescale", ge=0, le=2)  # 0=Hours, 1=Days, 2=Weeks
    histories: list[MarketHistoryEntryIn] = Field(
        alias="MarketHistories", max_length=MAX_ITENS_POR_LOTE
    )

    model_config = {"populate_by_name": True}


class GoldPricesUploadIn(BaseModel):
    prices: list[int] = Field(alias="Prices", max_length=MAX_ITENS_POR_LOTE)
    timestamps: list[int] = Field(alias="Timestamps", max_length=MAX_ITENS_POR_LOTE)

    model_config = {"populate_by_name": True}
