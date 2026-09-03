"""
Cobertura da task 31 — rollup diário/mensal (média ponderada por volume, idempotência),
poda por retenção, e o endpoint de demanda com book vazio.
"""

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select

from src.database import async_session_maker
from src.prices.models import MarketHistoryDaily, MarketHistoryEntry, MarketHistoryMonthly
from src.prices.tasks import _poda, _repair_rollups, _repair_then_prune, _rollup_diario
from tests.conftest import registrar_e_logar


def _unique_albion_id() -> int:
    return 900_000_000 + (uuid.uuid4().int % 90_000_000)


async def test_rollup_diario_uses_weighted_average_not_simple_average(db_session):
    """4 buckets de 6h -> 1 linha diária com soma correta e média ponderada por volume — se
    fosse média das médias (45) o resultado seria diferente do ponderado (26.5)."""
    item_id = _unique_albion_id()
    location_id = "1002"
    quality_level = 1
    hoje = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    dia_completo = hoje - timedelta(days=1)
    buckets = [
        (dia_completo, 100, Decimal("1000")),  # 10/unidade
        (dia_completo + timedelta(hours=6), 10, Decimal("1000")),  # 100/unidade
        (dia_completo + timedelta(hours=12), 50, Decimal("2500")),  # 50/unidade
        (dia_completo + timedelta(hours=18), 40, Decimal("800")),  # 20/unidade
    ]
    for bucket_start, amount, silver in buckets:
        db_session.add(
            MarketHistoryEntry(
                server_id="west",
                item_id=item_id,
                location_id=location_id,
                quality_level=quality_level,
                bucket_seconds=21600,
                bucket_start=bucket_start,
                item_amount=amount,
                silver_amount=silver,
            )
        )
    await db_session.commit()

    await _rollup_diario(async_session_maker)

    result = await db_session.execute(
        select(MarketHistoryDaily).where(MarketHistoryDaily.item_id == item_id)
    )
    rows = result.scalars().all()
    assert len(rows) == 1  # 4 buckets -> 1 linha diária
    row = rows[0]
    assert row.item_amount == 200
    assert row.silver_amount == Decimal("5300")
    assert row.preco_medio == Decimal("26.5000")  # ponderada, não média simples (45)


async def test_rollup_diario_is_idempotent(db_session):
    item_id = _unique_albion_id()
    location_id = "1002"
    quality_level = 1
    hoje = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    db_session.add(
        MarketHistoryEntry(
            server_id="west",
            item_id=item_id,
            location_id=location_id,
            quality_level=quality_level,
            bucket_seconds=21600,
            bucket_start=hoje - timedelta(days=1),
            item_amount=100,
            silver_amount=Decimal("1000"),
        )
    )
    await db_session.commit()

    await _rollup_diario(async_session_maker)
    await _rollup_diario(async_session_maker)  # reprocessar não duplica

    result = await db_session.execute(
        select(MarketHistoryDaily).where(MarketHistoryDaily.item_id == item_id)
    )
    rows = result.scalars().all()
    assert len(rows) == 1
    assert rows[0].item_amount == 100
    assert rows[0].silver_amount == Decimal("1000")


async def test_rollup_diario_keeps_servers_separate(db_session):
    item_id = _unique_albion_id()
    hoje = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    for server_id, amount in (("west", 10), ("east", 20)):
        db_session.add(
            MarketHistoryEntry(
                server_id=server_id,
                item_id=item_id,
                location_id="1002",
                quality_level=1,
                bucket_seconds=21600,
                bucket_start=hoje - timedelta(days=1),
                item_amount=amount,
                silver_amount=Decimal(amount * 10),
            )
        )
    await db_session.commit()

    await _rollup_diario(async_session_maker)
    rows = (
        await db_session.scalars(
            select(MarketHistoryDaily).where(MarketHistoryDaily.item_id == item_id)
        )
    ).all()
    assert {(row.server_id, row.item_amount) for row in rows} == {("west", 10), ("east", 20)}


async def test_rollup_uses_complete_utc_days_and_does_not_shrink_between_hours(db_session):
    now = datetime(2026, 8, 23, 12, 30, tzinfo=timezone.utc)
    item_id = _unique_albion_id()
    boundary_day = (now - timedelta(days=90)).replace(hour=0, minute=0, second=0, microsecond=0)
    first_complete_day = boundary_day + timedelta(days=1)
    yesterday = now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=1)
    current_day = yesterday + timedelta(days=1)

    for bucket_start, amount in (
        (boundary_day + timedelta(hours=18), 999),  # dia potencialmente parcial: não deriva
        (first_complete_day, 10),
        (first_complete_day + timedelta(hours=6), 20),
        (yesterday, 30),
        (yesterday + timedelta(hours=18), 40),
        (current_day, 888),  # dia ainda aberto: não deriva
    ):
        db_session.add(
            MarketHistoryEntry(
                server_id="west",
                item_id=item_id,
                location_id="1002",
                quality_level=1,
                bucket_seconds=21600,
                bucket_start=bucket_start,
                item_amount=amount,
                silver_amount=Decimal(amount * 10),
            )
        )
    await db_session.commit()

    await _repair_rollups(async_session_maker, now)
    first_run = (
        await db_session.scalars(
            select(MarketHistoryDaily)
            .where(MarketHistoryDaily.item_id == item_id)
            .order_by(MarketHistoryDaily.dia)
        )
    ).all()
    assert [(row.dia, row.item_amount) for row in first_run] == [
        (first_complete_day.date(), 30),
        (yesterday.date(), 70),
    ]

    await _repair_rollups(async_session_maker, now + timedelta(hours=1))
    second_run = (
        await db_session.scalars(
            select(MarketHistoryDaily)
            .where(MarketHistoryDaily.item_id == item_id)
            .order_by(MarketHistoryDaily.dia)
        )
    ).all()
    assert [(row.dia, row.item_amount) for row in second_run] == [
        (first_complete_day.date(), 30),
        (yesterday.date(), 70),
    ]


async def test_late_bucket_repairs_daily_and_monthly_idempotently(db_session):
    now = datetime(2026, 8, 23, 12, 30, tzinfo=timezone.utc)
    item_id = _unique_albion_id()
    day = datetime(2026, 8, 22, tzinfo=timezone.utc)

    db_session.add(
        MarketHistoryEntry(
            server_id="west",
            item_id=item_id,
            location_id="1002",
            quality_level=1,
            bucket_seconds=21600,
            bucket_start=day,
            item_amount=10,
            silver_amount=Decimal("100"),
        )
    )
    await db_session.commit()
    await _repair_rollups(async_session_maker, now)

    db_session.add(
        MarketHistoryEntry(
            server_id="west",
            item_id=item_id,
            location_id="1002",
            quality_level=1,
            bucket_seconds=21600,
            bucket_start=day + timedelta(hours=6),
            item_amount=20,
            silver_amount=Decimal("400"),
        )
    )
    await db_session.commit()
    await _repair_rollups(async_session_maker, now)
    await _repair_rollups(async_session_maker, now)  # replay não duplica

    daily = await db_session.scalar(
        select(MarketHistoryDaily).where(MarketHistoryDaily.item_id == item_id)
    )
    monthly = await db_session.scalar(
        select(MarketHistoryMonthly).where(MarketHistoryMonthly.item_id == item_id)
    )
    assert daily.item_amount == 30
    assert daily.silver_amount == Decimal("500")
    assert daily.preco_medio == Decimal("16.6667")
    assert monthly.item_amount == 30
    assert monthly.silver_amount == Decimal("500")
    assert monthly.preco_medio == Decimal("16.6667")


async def test_repair_then_prune_preserves_rollup_before_removing_old_raw(db_session):
    now = datetime(2026, 8, 23, 12, 30, tzinfo=timezone.utc)
    item_id = _unique_albion_id()
    complete_day = now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=89)
    db_session.add(
        MarketHistoryEntry(
            server_id="west",
            item_id=item_id,
            location_id="1002",
            quality_level=1,
            bucket_seconds=21600,
            bucket_start=complete_day,
            item_amount=15,
            silver_amount=Decimal("150"),
        )
    )
    await db_session.commit()

    await _repair_then_prune(async_session_maker, now)

    daily = await db_session.scalar(
        select(MarketHistoryDaily).where(MarketHistoryDaily.item_id == item_id)
    )
    monthly = await db_session.scalar(
        select(MarketHistoryMonthly).where(MarketHistoryMonthly.item_id == item_id)
    )
    assert daily.item_amount == 15
    assert monthly.item_amount == 15


async def test_poda_removes_stale_1h_bucket_but_keeps_6h_from_same_period(db_session):
    item_id = _unique_albion_id()
    location_id = "1002"
    quality_level = 1
    tres_dias_atras = datetime.now(timezone.utc) - timedelta(days=3)
    db_session.add(
        MarketHistoryEntry(
            server_id="west",
            item_id=item_id,
            location_id=location_id,
            quality_level=quality_level,
            bucket_seconds=3600,  # retenção de 48h -> 3 dias é velho, deve sumir
            bucket_start=tres_dias_atras,
            item_amount=5,
            silver_amount=Decimal("50"),
        )
    )
    db_session.add(
        MarketHistoryEntry(
            server_id="west",
            item_id=item_id,
            location_id=location_id,
            quality_level=quality_level,
            bucket_seconds=21600,  # retenção de 90 dias -> permanece
            bucket_start=tres_dias_atras,
            item_amount=30,
            silver_amount=Decimal("300"),
        )
    )
    await db_session.commit()

    await _poda(async_session_maker)

    result = await db_session.execute(
        select(MarketHistoryEntry).where(MarketHistoryEntry.item_id == item_id)
    )
    rows = result.scalars().all()
    assert len(rows) == 1
    assert rows[0].bucket_seconds == 21600


async def test_demand_endpoint_with_empty_book_returns_zeroed_fields_not_null(client):
    item_id = f"T2_TESTITEM_{uuid.uuid4().hex[:8]}"
    _, token = await registrar_e_logar(client)

    resp = await client.get(
        f"/items/{item_id}/demand",
        params={"server": "west", "location_id": "1002", "quality": 1},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["server"] == "west"
    empty_side = {
        "best_price": None,
        "observed_units": 0,
        "observed_orders": 0,
        "observed_at": None,
        "age_seconds": None,
    }
    assert body["book"]["sell"] == empty_side
    assert body["book"]["buy"] == empty_side
    assert body["book"]["coverage"] == "parcial"
    assert body["book"]["freshness_window_seconds"] == 6 * 60 * 60
    assert body["sold"]["last_24h"] == {"units": 0, "average_price": None}
    assert body["sold"]["last_7d"] == {"units": 0, "average_price": None}
    assert body["sold"]["last_30d"] == {"units": 0, "average_price": None}
    assert body["series_6h"] == []
    assert body["item"] == {"unique_name": item_id, "name": None}
    assert body["location_id"] == "1002"
