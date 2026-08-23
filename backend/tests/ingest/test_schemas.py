import pytest
from pydantic import ValidationError

from src.ingest.schemas import (
    GoldPricesUploadIn,
    MarketHistoriesUploadIn,
    MarketOrderIn,
    MarketUploadIn,
)


def test_market_order_in_accepts_go_payload():
    payload = {
        "Id": 12345,
        "ItemTypeId": "T4_BAG",
        "ItemGroupTypeId": "T4_BAG",
        "LocationId": "1002",
        "QualityLevel": 1,
        "EnchantmentLevel": 0,
        "UnitPriceSilver": 15000,
        "Amount": 3,
        "AuctionType": "offer",
        "Expires": "2026-08-21T00:00:00Z",
    }

    order = MarketOrderIn.model_validate(payload)

    assert order.id == 12345
    assert order.item_id == "T4_BAG"
    assert order.group_type_id == "T4_BAG"
    assert order.location_id == "1002"
    assert order.quality_level == 1
    assert order.enchantment_level == 0
    assert order.unit_price_silver == 15000
    assert order.amount == 3
    assert order.auction_type == "offer"
    assert order.expires == "2026-08-21T00:00:00Z"


def test_market_upload_in_accepts_list_of_orders():
    payload = {
        "Orders": [
            {
                "Id": 1,
                "ItemTypeId": "T2_FIBER",
                "ItemGroupTypeId": "T2_FIBER",
                "LocationId": "1002",
                "QualityLevel": 1,
                "EnchantmentLevel": 0,
                "UnitPriceSilver": 100,
                "Amount": 50,
                "AuctionType": "request",
                "Expires": "2026-08-21T00:00:00Z",
            }
        ]
    }

    upload = MarketUploadIn.model_validate(payload)

    assert len(upload.orders) == 1
    assert upload.orders[0].item_id == "T2_FIBER"


def test_market_order_in_rejects_non_numeric_quality_level():
    payload = {
        "Id": 1,
        "ItemTypeId": "T2_FIBER",
        "ItemGroupTypeId": "T2_FIBER",
        "LocationId": "1002",
        "QualityLevel": "not-a-number",
        "EnchantmentLevel": 0,
        "UnitPriceSilver": 100,
        "Amount": 50,
        "AuctionType": "request",
        "Expires": "2026-08-21T00:00:00Z",
    }

    with pytest.raises(ValidationError):
        MarketOrderIn.model_validate(payload)


def test_market_order_in_accepts_snake_case_via_populate_by_name():
    order = MarketOrderIn(
        id=1,
        item_id="T2_FIBER",
        group_type_id="T2_FIBER",
        location_id="1002",
        quality_level=1,
        enchantment_level=0,
        unit_price_silver=100,
        amount=50,
        auction_type="request",
        expires="2026-08-21T00:00:00Z",
    )

    assert order.item_id == "T2_FIBER"


def test_market_histories_upload_in_accepts_go_payload():
    payload = {
        "AlbionId": 1234,
        "LocationId": "3005",
        "QualityLevel": 4,
        "Timescale": 1,
        "MarketHistories": [
            {"ItemAmount": 10, "SilverAmount": 5000, "Timestamp": 1700000000},
        ],
    }

    upload = MarketHistoriesUploadIn.model_validate(payload)

    assert upload.albion_id == 1234
    assert upload.timescale == 1
    assert upload.histories[0].item_amount == 10


def test_market_histories_upload_in_rejects_timescale_out_of_range():
    payload = {
        "AlbionId": 1234,
        "LocationId": "3005",
        "QualityLevel": 4,
        "Timescale": 3,
        "MarketHistories": [],
    }

    with pytest.raises(ValidationError):
        MarketHistoriesUploadIn.model_validate(payload)


def test_gold_prices_upload_in_accepts_go_payload():
    payload = {"Prices": [2500, 2510], "Timestamps": [1700000000, 1700003600]}

    upload = GoldPricesUploadIn.model_validate(payload)

    assert upload.prices == [2500, 2510]
    assert upload.timestamps == [1700000000, 1700003600]
