"""Bloqueia processos até migrations/seed estarem realmente aplicados no banco."""

import argparse
import asyncio
import os
import time

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from src.config import get_settings


def migration_head() -> str:
    heads = ScriptDirectory.from_config(Config("alembic.ini")).get_heads()
    if len(heads) != 1:
        raise RuntimeError(f"esperado um único head Alembic, encontrados: {heads}")
    return heads[0]


async def bootstrap_ready(requirement: str) -> bool:
    engine = create_async_engine(get_settings().database_url, pool_pre_ping=True)
    try:
        async with engine.connect() as connection:
            current = await connection.scalar(text("SELECT version_num FROM alembic_version"))
            if current != migration_head():
                return False
            if requirement == "migrations":
                return True
            return bool(
                await connection.scalar(
                    text("SELECT EXISTS (SELECT 1 FROM static_dataset_version WHERE active)")
                )
            )
    except Exception:
        return False
    finally:
        await engine.dispose()


async def wait_for_bootstrap(requirement: str, timeout: int, interval: float) -> None:
    deadline = time.monotonic() + timeout
    while True:
        if await bootstrap_ready(requirement):
            return
        if time.monotonic() >= deadline:
            raise TimeoutError(f"bootstrap não atingiu {requirement!r} em {timeout}s")
        await asyncio.sleep(interval)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--require", choices=("migrations", "dataset"), required=True)
    parser.add_argument("--timeout", type=int, default=600)
    parser.add_argument("--interval", type=float, default=2.0)
    parser.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    command = args.command[1:] if args.command[:1] == ["--"] else args.command
    if not command:
        parser.error("informe o comando depois de --")
    asyncio.run(wait_for_bootstrap(args.require, args.timeout, args.interval))
    os.execvp(command[0], command)


if __name__ == "__main__":
    main()
