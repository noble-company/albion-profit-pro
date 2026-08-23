import pytest
from pydantic import ValidationError

from src.ingest.schemas import (
    GoldPricesUploadIn,
    MarketHistoriesUploadIn,
    MarketOrderIn,
    MarketUploadIn,
)

REAL_DOTNET_TICK = 639_229_968_000_000_000


def _valid_order(**overrides):
    order = {
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
    order.update(overrides)
    return order


def test_market_order_in_accepts_go_payload():
    payload = _valid_order()

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
    assert order.expires == "2026-08-21T00:00:00+00:00"


def test_market_upload_in_accepts_list_of_orders():
    payload = {"Orders": [_valid_order(Id=1, ItemTypeId="T2_FIBER", AuctionType="request")]}

    upload = MarketUploadIn.model_validate(payload)

    assert len(upload.orders) == 1
    assert upload.orders[0].item_id == "T2_FIBER"


def test_market_order_in_rejects_non_numeric_quality_level():
    payload = _valid_order(QualityLevel="not-a-number")

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


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("Id", 0),
        ("ItemTypeId", ""),
        ("ItemTypeId", "X" * 65),
        ("LocationId", "   "),
        ("QualityLevel", 0),
        ("QualityLevel", 6),
        ("EnchantmentLevel", -1),
        ("EnchantmentLevel", 5),
        ("UnitPriceSilver", 0),
        ("Amount", 0),
        ("AuctionType", "sell"),
    ],
)
def test_market_order_rejects_values_outside_measured_contract(field, value):
    with pytest.raises(ValidationError):
        MarketOrderIn.model_validate(_valid_order(**{field: value}))


@pytest.mark.parametrize(
    ("value", "normalized"),
    [
        ("2026-09-21T06:39:47", "2026-09-21T06:39:47+00:00"),
        ("2026-09-21T06:39:47.6", "2026-09-21T06:39:47.600000+00:00"),
        ("2026-09-21T06:39:47.636097", "2026-09-21T06:39:47.636097+00:00"),
        ("2026-09-21T06:39:47Z", "2026-09-21T06:39:47+00:00"),
        ("2026-09-21T03:39:47-03:00", "2026-09-21T06:39:47+00:00"),
    ],
)
def test_market_order_normalizes_expiration_precision_and_timezone(value, normalized):
    assert MarketOrderIn.model_validate(_valid_order(Expires=value)).expires == normalized


@pytest.mark.parametrize(
    "value",
    [
        "2026-09-21",
        "2026-09-21 06:39:47",
        "2026-09-21T06:39:47.1234567",
        "not-a-date",
    ],
)
def test_market_order_rejects_expiration_outside_wire_format(value):
    with pytest.raises(ValidationError):
        MarketOrderIn.model_validate(_valid_order(Expires=value))


def test_market_histories_upload_in_accepts_go_payload():
    payload = {
        "AlbionId": 1234,
        "LocationId": "3005",
        "QualityLevel": 4,
        "Timescale": 1,
        "MarketHistories": [
            {"ItemAmount": 10, "SilverAmount": 5000, "Timestamp": REAL_DOTNET_TICK},
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


@pytest.mark.parametrize("timestamp", [1_700_000_000, -1, 2**64])
def test_market_history_rejects_implausible_dotnet_timestamp(timestamp):
    payload = {
        "AlbionId": 1234,
        "LocationId": "3005",
        "QualityLevel": 4,
        "Timescale": 1,
        "MarketHistories": [
            {"ItemAmount": 0, "SilverAmount": 0, "Timestamp": timestamp},
        ],
    }
    with pytest.raises(ValidationError):
        MarketHistoriesUploadIn.model_validate(payload)


def test_gold_prices_upload_in_accepts_go_payload():
    payload = {"Prices": [2500, 2510], "Timestamps": [1700000000, 1700003600]}

    upload = GoldPricesUploadIn.model_validate(payload)

    assert upload.prices == [2500, 2510]
    assert upload.timestamps == [1700000000, 1700003600]


def test_gold_prices_rejects_misaligned_arrays():
    with pytest.raises(ValidationError, match="mesmo tamanho"):
        GoldPricesUploadIn.model_validate({"Prices": [2500], "Timestamps": []})


@pytest.mark.parametrize(
    "payload",
    [
        {"Prices": [-1], "Timestamps": [1_700_000_000]},
        {"Prices": [2500], "Timestamps": [-1]},
        {"Prices": ["2500"], "Timestamps": [1_700_000_000]},
    ],
)
def test_gold_prices_rejects_invalid_numeric_domain(payload):
    with pytest.raises(ValidationError):
        GoldPricesUploadIn.model_validate(payload)
