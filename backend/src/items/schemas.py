from pydantic import BaseModel, ConfigDict


class ItemCatalogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    unique_name: str
    albion_id: int | None
    name_pt: str | None
    name_en: str | None
    tier: int | None
    enchantment_level: int
    shop_category: str | None
    shop_subcategory: str | None
    shop_subcategory2: str | None
    shop_subcategory3: str | None
    tem_receita: bool


class LocationOut(BaseModel):
    location_id: str
    name: str | None
    display_name: str
    kind: str
    is_royal_city: bool


class CategoryOut(BaseModel):
    category: str
    subcategory: str | None = None
    subcategory2: str | None = None
    subcategory3: str | None = None
