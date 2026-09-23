import re
from datetime import timezone
from typing import Annotated, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from src.ingest.normalize import TICKS_UNIX_EPOCH, datetime_from_expires, datetime_from_ticks

INT32_MAX = 2**31 - 1
INT64_MAX = 2**63 - 1
UINT64_MAX = 2**64 - 1
MAX_ID_LENGTH = 64
NonNegativeInt64 = Annotated[int, Field(strict=True, ge=0, le=INT64_MAX)]

_EXPIRES_PATTERN = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})?$"
)


def _not_blank(value: str) -> str:
    if not value.strip():
        raise ValueError("must not be blank")
    return value


class MarketOrderIn(BaseModel):
    id: int = Field(alias="Id", strict=True, ge=1, le=INT64_MAX)
    item_id: str = Field(alias="ItemTypeId", min_length=1, max_length=MAX_ID_LENGTH)
    # O client envia vazio em algumas ordens reais/legadas; por isso só há teto aqui.
    group_type_id: str = Field(alias="ItemGroupTypeId", max_length=MAX_ID_LENGTH)
    location_id: str = Field(alias="LocationId", min_length=1, max_length=MAX_ID_LENGTH)
    quality_level: int = Field(alias="QualityLevel", strict=True, ge=1, le=5)
    enchantment_level: int = Field(alias="EnchantmentLevel", strict=True, ge=0, le=4)
    unit_price_silver: int = Field(alias="UnitPriceSilver", strict=True, ge=1, le=INT64_MAX)
    amount: int = Field(alias="Amount", strict=True, ge=1, le=INT64_MAX)
    auction_type: Literal["offer", "request"] = Field(alias="AuctionType")
    expires: str = Field(alias="Expires", min_length=19, max_length=32)

    @field_validator("item_id", "location_id")
    @classmethod
    def validate_required_identifier(cls, value: str) -> str:
        return _not_blank(value)

    @field_validator("expires")
    @classmethod
    def normalize_expires(cls, value: str) -> str:
        if not _EXPIRES_PATTERN.fullmatch(value):
            raise ValueError("deve ser ISO 8601 com T, 0..6 casas decimais e timezone opcional")
        normalized = datetime_from_expires(value)
        return normalized.astimezone(timezone.utc).isoformat()

    model_config = {"populate_by_name": True}


# A captura real mostra lotes de ~50 ordens; 5000 é
# folgado e ainda protege o broker de um client defeituoso (ou hostil, com token válido)
# mandando um payload gigante. Vale pra toda lista de ingest, não só `orders` — o mesmo
# risco existe em qualquer campo sem teto.
MAX_ITENS_POR_LOTE = 5000


class MarketUploadIn(BaseModel):
    orders: list[MarketOrderIn] = Field(alias="Orders", min_length=1, max_length=MAX_ITENS_POR_LOTE)

    model_config = {"populate_by_name": True}


class MarketHistoryEntryIn(BaseModel):
    # O client corrige/descarta valores negativos, mas pode transmitir bucket sem volume.
    item_amount: int = Field(alias="ItemAmount", strict=True, ge=0, le=INT64_MAX)
    silver_amount: int = Field(alias="SilverAmount", strict=True, ge=0, le=UINT64_MAX)
    timestamp: int = Field(alias="Timestamp", strict=True, ge=TICKS_UNIX_EPOCH, le=UINT64_MAX)

    @field_validator("timestamp")
    @classmethod
    def validate_dotnet_timestamp(cls, value: int) -> int:
        # Também rejeita epoch Unix e valores fora do intervalo representável pelo Python.
        datetime_from_ticks(value)
        return value

    model_config = {"populate_by_name": True}


class MarketHistoriesUploadIn(BaseModel):
    albion_id: int = Field(alias="AlbionId", strict=True, ge=1, le=INT32_MAX)
    location_id: str = Field(alias="LocationId", min_length=1, max_length=MAX_ID_LENGTH)
    quality_level: int = Field(alias="QualityLevel", strict=True, ge=1, le=5)
    timescale: int = Field(alias="Timescale", strict=True, ge=0, le=2)  # 0=Hours, 1=Days, 2=Weeks
    histories: list[MarketHistoryEntryIn] = Field(
        alias="MarketHistories", min_length=1, max_length=MAX_ITENS_POR_LOTE
    )

    @field_validator("location_id")
    @classmethod
    def validate_location_id(cls, value: str) -> str:
        return _not_blank(value)

    model_config = {"populate_by_name": True}


class GoldPricesUploadIn(BaseModel):
    # Ouro usa epoch Unix no struct Go, não ticks .NET como o histórico de mercado.
    prices: list[NonNegativeInt64] = Field(alias="Prices", max_length=MAX_ITENS_POR_LOTE)
    timestamps: list[NonNegativeInt64] = Field(alias="Timestamps", max_length=MAX_ITENS_POR_LOTE)

    @model_validator(mode="after")
    def validate_aligned_arrays(self):
        if len(self.prices) != len(self.timestamps):
            raise ValueError("Prices e Timestamps devem ter o mesmo tamanho")
        return self

    model_config = {"populate_by_name": True}
