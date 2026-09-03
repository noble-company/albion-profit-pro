"""Roda contra o Redis efêmero do testcontainers (task 20, ver tests/conftest.py)."""

import asyncio

from src.cache.redis_client import (
    _book_cache_key,
    delete_book_depth,
    get_redis,
    mget_book_depths,
    set_book_depth,
)


async def test_set_and_mget_book_depth_roundtrip():
    redis = get_redis()
    await set_book_depth(redis, "west", "T2_FIBER", "1002", 1, 0, {"venda": {"preco": "37"}})
    result = await mget_book_depths(redis, "west", "T2_FIBER", [("1002", 1, 0), ("1002", 2, 0)])
    assert result[("1002", 1, 0)] == {"venda": {"preco": "37"}}
    assert result[("1002", 2, 0)] is None


async def test_mget_book_depths_with_empty_combos_returns_empty_dict():
    assert await mget_book_depths(get_redis(), "west", "T8_RUNITE_ORE", []) == {}


async def test_book_cache_is_versioned_and_can_be_invalidated():
    redis = get_redis()
    assert _book_cache_key("west", "T2_FIBER", "1002", 1, 0).startswith("livro:v2:")
    await set_book_depth(redis, "west", "T2_DELETE", "1002", 1, 0, {"value": 1})
    await delete_book_depth(redis, "west", "T2_DELETE", "1002", 1, 0)
    result = await mget_book_depths(redis, "west", "T2_DELETE", [("1002", 1, 0)])
    assert result[("1002", 1, 0)] is None


async def test_book_depth_expires_after_ttl():
    redis = get_redis()
    await set_book_depth(
        redis, "west", "T4_LEATHER", "1002", 2, 0, {"venda": {"preco": "42"}}, ttl_seconds=1
    )
    await asyncio.sleep(1.5)
    result = await mget_book_depths(redis, "west", "T4_LEATHER", [("1002", 2, 0)])
    assert result[("1002", 2, 0)] is None
