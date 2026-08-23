import uuid

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import async_sessionmaker

from src.config import get_settings
from src.ingest.normalize import (
    BUCKET_POR_TIMESCALE,
    datetime_from_expires,
    datetime_from_ticks,
    silver_from_wire,
)
from src.items.models import Item
from src.items.service import upsert_locations
from src.prices.models import MarketHistoryEntry, MarketOrder
from src.prices.service import recompute_and_cache_book, record_scans

settings = get_settings()


async def save_market_orders(
    sessionmaker: async_sessionmaker, redis, payload: dict, user_id: str | None = None
) -> None:
    """Sem `user_id` na tabela-fato: `market_order` é o estado atual do livro, global (task
    27, docs/04-revisao-fase-1.md achado C2). Procedência por usuário vai pra `market_scan`
    (task 30) — `user_id` aqui é opcional só pra manter os testes que não se importam com
    cobertura chamando esta função sem autenticação."""
    orders = payload["orders"]
    if not orders:
        return

    # Dedup por source_id dentro do próprio lote: o client reenvia o livro inteiro a cada
    # varredura e o Postgres recusa ON CONFLICT batendo na mesma linha duas vezes no mesmo
    # INSERT ("cannot affect row a second time"). Último valor do lote vence.
    rows_by_source_id = {}
    for o in orders:
        rows_by_source_id[o["id"]] = {
            "source_id": o["id"],
            "item_id": o["item_id"],
            "group_type_id": o["group_type_id"],
            "location_id": o["location_id"],
            "quality_level": o["quality_level"],
            "enchantment_level": o["enchantment_level"],
            # UnitPriceSilver vem do wire multiplicado por 10.000 — convertido na borda
            # do ingest, uma única vez (ver task 25, docs/03-contrato-ingest-real.md secao 1)
            "unit_price_silver": silver_from_wire(o["unit_price_silver"]),
            "amount": o["amount"],
            "auction_type": o["auction_type"],
            "expires": datetime_from_expires(o["expires"]),
        }
    rows = list(rows_by_source_id.values())

    async with sessionmaker() as session:
        # Preenchimento oportunista de localização (task 28) — nunca bloqueia o ingest por
        # location_id desconhecida (achado N3: a lista fixa antiga descartava esse dado).
        await upsert_locations(session, {o["location_id"] for o in orders})

        stmt = pg_insert(MarketOrder).values(rows)
        stmt = stmt.on_conflict_do_update(
            constraint="uq_market_order_source",
            set_={
                "unit_price_silver": stmt.excluded.unit_price_silver,
                "amount": stmt.excluded.amount,
                "expires": stmt.excluded.expires,
                "last_seen_at": func.now(),
            },
        )
        await session.execute(stmt)  # insere/atualiza o lote inteiro numa query só

        if user_id is not None:
            scan_combos = {(o["item_id"], o["location_id"], o["quality_level"]) for o in orders}
            await record_scans(session, uuid.UUID(user_id), "livro", scan_combos)

        await session.commit()

        # Profundidade recalculada do Postgres, nunca somada do lote (achado C4: um lote só
        # tem o que aquele jogador enxergou na tela — somar subestima). Uma query agregada
        # cobre todas as combinações tocadas de uma vez (task 29).
        combos = {
            (o["item_id"], o["location_id"], o["quality_level"], o["enchantment_level"])
            for o in orders
        }
        await recompute_and_cache_book(session, redis, combos, settings.price_freshness_hours)


async def save_market_history(
    sessionmaker: async_sessionmaker, redis, payload: dict, user_id: str | None = None
) -> None:
    """Sem `user_id` na tabela-fato: o histórico é autoritativo do servidor do jogo, global
    (task 26, docs/04-revisao-fase-1.md achado M7). Procedência por usuário vai pra
    `market_scan` (task 30) — `user_id` aqui é opcional pelo mesmo motivo de
    `save_market_orders`."""
    bucket_seconds = BUCKET_POR_TIMESCALE[payload["timescale"]]

    # Dedup por bucket_start dentro do próprio lote: os timestamps não vêm ordenados e podem
    # se repetir; o Postgres recusa ON CONFLICT batendo na mesma linha duas vezes no mesmo
    # INSERT ("cannot affect row a second time"). Último valor do lote vence.
    rows_by_bucket = {}
    for h in payload["histories"]:
        bucket_start = datetime_from_ticks(h["timestamp"])
        rows_by_bucket[bucket_start] = {
            "item_id": payload["albion_id"],
            "location_id": payload["location_id"],
            "quality_level": payload["quality_level"],
            "bucket_seconds": bucket_seconds,
            "bucket_start": bucket_start,
            "item_amount": h["item_amount"],
            # SilverAmount vem do wire multiplicado por 10.000 (é o total do bucket, não o
            # unitário) — convertido na borda do ingest (task 25)
            "silver_amount": silver_from_wire(h["silver_amount"]),
        }
    rows = list(rows_by_bucket.values())
    if not rows:
        return

    async with sessionmaker() as session:
        # Preenchimento oportunista de localização (task 28) — ver mesmo comentário em
        # save_market_orders.
        await upsert_locations(session, {payload["location_id"]})

        stmt = pg_insert(MarketHistoryEntry).values(rows)
        stmt = stmt.on_conflict_do_update(
            constraint="uq_market_history_bucket",
            set_={
                "item_amount": stmt.excluded.item_amount,
                "silver_amount": stmt.excluded.silver_amount,
                "last_seen_at": func.now(),
            },
        )
        await session.execute(stmt)
        await session.commit()

        # Resolve o AlbionId (int) pro ItemTypeId (string) via `item` (task 28) — o cache de
        # profundidade é indexado pelo mesmo identificador usado por marketorders.ingest.
        # Sem correspondência ainda no `item` (import_items.py não rodou pra esse Index),
        # não há como recalcular — não é um erro, só não tem o que cachear ainda.
        item_row = await session.scalar(select(Item).where(Item.albion_id == payload["albion_id"]))
        if item_row is not None:
            if user_id is not None:
                scan_combo = {
                    (item_row.unique_name, payload["location_id"], payload["quality_level"])
                }
                await record_scans(session, uuid.UUID(user_id), "historico", scan_combo)
                await session.commit()

            combos = {
                (
                    item_row.unique_name,
                    payload["location_id"],
                    payload["quality_level"],
                    item_row.enchantment_level,
                )
            }
            await recompute_and_cache_book(session, redis, combos, settings.price_freshness_hours)
