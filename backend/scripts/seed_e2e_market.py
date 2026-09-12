"""Seed determinístico de mercado para a suíte E2E do frontend (task 3.5/27).

A suíte unitária do frontend usa MSW; a E2E usa API + PostgreSQL + Redis reais. Este script
popula ``market_order`` sem subir um worker Celery — chama o mesmo caminho de escrita do
ingest (``src.ingest.service.save_market_orders``), então a transformação fio→banco é a de
produção, não uma cópia que pode divergir.

Fontes:

* os payloads reais em ``backend/tests/fixtures/wire/marketorders-real-*.json`` (capturados
  do jogo), com ``Expires`` deslocado pra frente pra nunca vencer entre execuções;
* um *flip* determinístico (``T4_FIBER_LEVEL3@3``, Fort Sterling → Caerleon) e um *refino*
  determinístico (``T4_CLOTH`` em Caerleon, receita real 2×T4_FIBER + 1×T3_CLOTH), com
  preço na ordem de grandeza real e spread deliberado — pra ter oportunidades lucrativas
  estáveis pras asserções da E2E;
* volume sintético (recurso × tier) só pra exercitar paginação e estabilidade de ordenação.

Uso (a partir de ``backend/``, com a stack de ``docker-compose.yml`` no ar e as migrations
aplicadas)::

    uv run python -m scripts.seed_e2e_market --realm west --reset

``--reset`` apaga ``market_order`` do realm antes de semear (idempotência dura).

O antigo ``--rebuild-ranking`` saiu com o ranking materializado (task 4/15): as telas de
produção calculam no navegador sobre ``/prices/snapshot`` e não precisam de passo extra.
"""

import argparse
import asyncio
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import structlog
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import async_sessionmaker

from src.cache.redis_client import new_redis_client
from src.database import create_worker_engine
from src.ingest.schemas import MarketUploadIn
from src.ingest.service import save_market_orders
from src.prices.constants import AlbionServer
from src.prices.models import MarketOrder

log = structlog.get_logger()

FIXTURES_WIRE = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "wire"

MARKET_ORDER_FIXTURES = (
    "marketorders-real-t2fiber.json",
    "marketorders-real-t4fiber-ench3-offer.json",
    "marketorders-real-t4fiber-ench3-request.json",
)

# Cenário de flip determinístico. Preço na ordem de grandeza real de T4_FIBER_LEVEL3@3
# (~5.000 de prata por unidade no fixture); o spread — compra a 4.000 em Fort Sterling
# (4002), venda a 5.500 em Caerleon (3005) — é deliberado pra garantir lucro positivo
# estável mesmo com premium ligado (imposto 4%) e o filtro "só lucrativas". Prata no fio
# vem sempre x10.000.
FLIP_ITEM = {
    "ItemTypeId": "T4_FIBER_LEVEL3@3",
    "ItemGroupTypeId": "T4_FIBER_LEVEL3",
    "QualityLevel": 1,
    "EnchantmentLevel": 3,
}
FLIP_LEGS = (
    # (LocationId, AuctionType, UnitPriceSilver no fio [x10.000], Amount, source_id)
    ("4002", "offer", 4_000 * 10_000, 120, 990_000_001),
    ("3005", "request", 5_500 * 10_000, 120, 990_000_002),
)

# Cenário de refino determinístico em Caerleon (3005): T4_CLOTH = 2× T4_FIBER + 1× T3_CLOTH
# (receita real do dump). Preços na ordem de grandeza da economia real; margem positiva
# deliberada pra dar uma linha lucrativa estável na tela de Refino. Ingredientes como `offer`
# (o refino compra do book); a saída como `request` (o refino vende num pedido de compra) —
# é o que dá preço de venda imediata à receita.
REFINING_LEGS = (
    # (ItemTypeId, EnchantmentLevel, LocationId, AuctionType, UnitPrice no fio, Amount, source_id)
    ("T4_FIBER", 0, "3005", "offer", 130 * 10_000, 5_000, 990_000_010),
    ("T3_CLOTH", 0, "3005", "offer", 210 * 10_000, 5_000, 990_000_011),
    ("T4_CLOTH", 0, "3005", "request", 900 * 10_000, 500, 990_000_012),
    ("T4_CLOTH", 0, "3005", "offer", 950 * 10_000, 500, 990_000_013),
)


def _shifted_expires(days: int = 14) -> str:
    """ISO sem timezone, no formato que o client Go emite (o ingest assume UTC)."""
    return (datetime.now(timezone.utc) + timedelta(days=days)).replace(tzinfo=None).isoformat()


def _load_fixture(name: str) -> dict:
    raw = json.loads((FIXTURES_WIRE / name).read_text())
    for order in raw["Orders"]:
        order["Expires"] = _shifted_expires()
    return raw


def _flip_payload() -> dict:
    orders = [
        {
            **FLIP_ITEM,
            "Id": source_id,
            "LocationId": location_id,
            "UnitPriceSilver": unit_price,
            "Amount": amount,
            "AuctionType": auction_type,
            "Expires": _shifted_expires(),
        }
        for location_id, auction_type, unit_price, amount, source_id in FLIP_LEGS
    ]
    return {"Orders": orders}


# Volume sintético pra exercitar paginação e estabilidade de ordenação entre páginas (F08):
# um flip lucrativo por (recurso × tier), todos Fort Sterling → Caerleon, spread fixo de 40%.
BULK_RESOURCES = ("FIBER", "WOOD", "ORE", "HIDE", "ROCK")
BULK_TIERS = (4, 5, 6, 7, 8)


def _bulk_flip_payload() -> dict:
    orders: list[dict] = []
    source_id = 991_000_000
    for resource in BULK_RESOURCES:
        for tier in BULK_TIERS:
            item = f"T{tier}_{resource}"
            buy = (tier * 100) * 10_000
            sell = int(buy * 1.4)
            for location_id, auction_type, price in (
                ("4002", "offer", buy),
                ("3005", "request", sell),
            ):
                source_id += 1
                orders.append(
                    {
                        "Id": source_id,
                        "ItemTypeId": item,
                        "ItemGroupTypeId": item,
                        "LocationId": location_id,
                        "QualityLevel": 1,
                        "EnchantmentLevel": 0,
                        "UnitPriceSilver": price,
                        "Amount": 200,
                        "AuctionType": auction_type,
                        "Expires": _shifted_expires(),
                    }
                )
    return {"Orders": orders}


def _refining_payload() -> dict:
    orders = [
        {
            "Id": source_id,
            "ItemTypeId": item_id,
            "ItemGroupTypeId": item_id,
            "LocationId": location_id,
            "QualityLevel": 1,
            "EnchantmentLevel": ench,
            "UnitPriceSilver": unit_price,
            "Amount": amount,
            "AuctionType": auction_type,
            "Expires": _shifted_expires(),
        }
        for item_id, ench, location_id, auction_type, unit_price, amount, source_id in REFINING_LEGS
    ]
    return {"Orders": orders}


async def _seed(realm: str, reset: bool) -> None:
    engine = create_worker_engine()
    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)
    redis = new_redis_client()
    try:
        if reset:
            async with sessionmaker() as session:
                await session.execute(delete(MarketOrder).where(MarketOrder.server_id == realm))
                await session.commit()
            log.info("e2e_market.reset", realm=realm)

        payloads = [_load_fixture(name) for name in MARKET_ORDER_FIXTURES]
        payloads.append(_flip_payload())
        payloads.append(_bulk_flip_payload())
        payloads.append(_refining_payload())

        total = 0
        for raw in payloads:
            payload = MarketUploadIn.model_validate(raw).model_dump(by_alias=False)
            await save_market_orders(sessionmaker, redis, payload, server_id=realm)
            total += len(payload["orders"])

        log.info("e2e_market.concluido", realm=realm, ordens=total)
    finally:
        await redis.aclose()
        await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--realm",
        default=AlbionServer.WEST.value,
        choices=[s.value for s in AlbionServer],
    )
    parser.add_argument("--reset", action="store_true", help="apaga market_order do realm antes")
    args = parser.parse_args()
    asyncio.run(_seed(args.realm, args.reset))


if __name__ == "__main__":
    main()
