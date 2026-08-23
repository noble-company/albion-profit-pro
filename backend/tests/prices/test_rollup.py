"""
Cobertura da task 31 — rollup diário/mensal (média ponderada por volume, idempotência),
poda por retenção, e o endpoint de demanda com livro vazio.
"""

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select

from src.database import async_session_maker
from src.prices.models import MarketHistoryDaily, MarketHistoryEntry
from src.prices.tasks import _poda, _rollup_diario
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
    buckets = [
        (hoje, 100, Decimal("1000")),  # 10/unidade
        (hoje + timedelta(hours=6), 10, Decimal("1000")),  # 100/unidade
        (hoje + timedelta(hours=12), 50, Decimal("2500")),  # 50/unidade
        (hoje + timedelta(hours=18), 40, Decimal("800")),  # 20/unidade
    ]
    for bucket_start, amount, silver in buckets:
        db_session.add(
            MarketHistoryEntry(
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
            item_id=item_id,
            location_id=location_id,
            quality_level=quality_level,
            bucket_seconds=21600,
            bucket_start=hoje,
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


async def test_poda_removes_stale_1h_bucket_but_keeps_6h_from_same_period(db_session):
    item_id = _unique_albion_id()
    location_id = "1002"
    quality_level = 1
    tres_dias_atras = datetime.now(timezone.utc) - timedelta(days=3)
    db_session.add(
        MarketHistoryEntry(
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
        params={"location_id": "1002", "quality": 1},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["livro"]["venda"] == {"preco": None, "total_unidades": 0, "qtd_ordens": 0}
    assert body["livro"]["compra"] == {"preco": None, "total_unidades": 0, "qtd_ordens": 0}
    assert body["livro"]["varredura_em"] is None
    assert body["vendido"]["ultimas_24h"] == {"unidades": 0, "preco_medio": None}
    assert body["vendido"]["ultimos_7d"] == {"unidades": 0, "preco_medio": None}
    assert body["vendido"]["ultimos_30d"] == {"unidades": 0, "preco_medio": None}
    assert body["serie_6h"] == []
    assert body["item"] == {"unique_name": item_id, "nome": None}
    assert body["location_id"] == "1002"
