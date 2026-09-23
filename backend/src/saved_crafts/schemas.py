import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Realm = Literal["west", "east", "europe"]


class SavedCraftCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    server: Realm
    output_item: str = Field(min_length=1, max_length=64)
    quantity: int = Field(ge=1, le=1_000_000)
    output_quality: int = Field(ge=1, le=5)


class SavedCraftOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    server: Realm
    output_item: str
    quantity: int
    output_quality: int
    created_at: datetime
    updated_at: datetime
