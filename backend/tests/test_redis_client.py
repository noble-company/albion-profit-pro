"""Roda contra o Redis efêmero do testcontainers (task 20, ver tests/conftest.py)."""

import asyncio

from src.cache.redis_client import get_redis, mget_book_depths, publish_price_update, set_book_depth


async def test_set_and_mget_book_depth_roundtrip():
    redis = get_redis()
    await set_book_depth(redis, "T2_FIBER", "1002", 1, 0, {"venda": {"preco": "37"}})
    result = await mget_book_depths(redis, "T2_FIBER", [("1002", 1, 0), ("1002", 2, 0)])
    assert result[("1002", 1, 0)] == {"venda": {"preco": "37"}}
    assert result[("1002", 2, 0)] is None


async def test_mget_book_depths_with_empty_combos_returns_empty_dict():
    assert await mget_book_depths(get_redis(), "T8_RUNITE_ORE", []) == {}


async def test_book_depth_expires_after_ttl():
    redis = get_redis()
    await set_book_depth(
        redis, "T4_LEATHER", "1002", 2, 0, {"venda": {"preco": "42"}}, ttl_seconds=1
    )
    await asyncio.sleep(1.5)
    result = await mget_book_depths(redis, "T4_LEATHER", [("1002", 2, 0)])
    assert result[("1002", 2, 0)] is None


async def test_publish_price_update_does_not_raise_without_subscribers():
    await publish_price_update(get_redis(), "T2_FIBER", {"price": 100})
