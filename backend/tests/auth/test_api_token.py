import asyncio
import uuid
from pathlib import Path

import pytest
from fastapi import HTTPException
from sqlalchemy import inspect, select, text

from src.api_tokens.dependencies import require_api_token
from src.api_tokens.models import ApiToken
from src.api_tokens.service import (
    create_token,
    generate_token,
    get_valid_token,
    hash_token,
    revoke_token,
)
from src.database import async_session_maker, engine
from tests.conftest import criar_usuario


def test_generate_token_format_and_uniqueness():
    tokens = {generate_token() for _ in range(50)}
    assert len(tokens) == 50  # todos únicos
    assert all(t.startswith("apk_") for t in tokens)


async def test_create_and_validate_token(db_session):
    user = await criar_usuario(db_session)
    token = await create_token(db_session, user.id)
    assert token.token.startswith("apk_")
    assert token.revoked_at is None

    found = await get_valid_token(db_session, token.token)
    assert found is not None
    assert found.id == token.id


async def test_invalid_token_returns_none(db_session):
    assert await get_valid_token(db_session, "apk_isso-nao-existe") is None


async def test_revoked_token_is_no_longer_valid(db_session):
    user = await criar_usuario(db_session)
    token = await create_token(db_session, user.id)
    revoked = await revoke_token(db_session, token.id, owner_id=user.id)
    assert revoked is True

    found = await get_valid_token(db_session, token.token)
    assert found is None  # revogado não conta mais como válido


async def test_revoke_token_rejects_non_owner(db_session):
    owner = await criar_usuario(db_session)
    other = await criar_usuario(db_session)
    token = await create_token(db_session, owner.id)

    # `other` tentando revogar o token de `owner` não deve funcionar
    revoked = await revoke_token(db_session, token.id, owner_id=other.id)
    assert revoked is False

    still_valid = await get_valid_token(db_session, token.token)
    assert still_valid is not None


async def test_require_api_token_rejects_missing_header(db_session):
    with pytest.raises(HTTPException) as exc_info:
        await require_api_token(authorization=None, session=db_session)
    assert exc_info.value.status_code == 401


async def test_require_api_token_rejects_invalid_token(db_session):
    with pytest.raises(HTTPException) as exc_info:
        await require_api_token(authorization="Bearer apk_lixo", session=db_session)
    assert exc_info.value.status_code == 401


async def test_require_api_token_accepts_valid_token(db_session):
    user = await criar_usuario(db_session)
    token = await create_token(db_session, user.id)
    result = await require_api_token(authorization=f"Bearer {token.token}", session=db_session)
    assert result.id == token.id


async def test_raw_token_value_is_not_stored_anywhere_in_the_row(db_session):
    """Task 32, achado A1: um dump do Postgres não pode entregar tokens funcionando —
    confirma que o valor cru não aparece em NENHUMA coluna da linha (não só que a coluna
    `token` não existe mais — afirma isso na própria linha, contra qualquer schema
    futuro)."""
    user = await criar_usuario(db_session)
    token = await create_token(db_session, user.id)
    raw = token.token

    result = await db_session.execute(select(ApiToken).where(ApiToken.id == token.id))
    row = result.scalar_one()
    for column in inspect(ApiToken).columns:
        value = getattr(row, column.key)
        assert value != raw
        assert raw not in str(value)

    assert row.token_hash == hash_token(raw)
    assert row.token_sufixo == raw[-4:]


async def test_migration_backfills_hash_and_preserves_authentication():
    """Prova que a migração da task 32 não invalida ninguém: grava um token no formato
    antigo (coluna `token` cru, schema de antes desta migração), roda `upgrade`, confirma
    que ele continua autenticando via hash."""
    from alembic.config import Config

    from alembic import command

    alembic_cfg = Config(str(Path(__file__).resolve().parent.parent.parent / "alembic.ini"))
    loop = asyncio.get_running_loop()

    async with async_session_maker() as session:
        user = await criar_usuario(session)
    raw = generate_token()
    token_id = uuid.uuid4()

    try:
        # command.downgrade/upgrade chamam asyncio.run() por dentro — não pode rodar direto
        # de um teste async já dentro de um loop (mesmo motivo documentado em
        # tests/ingest/test_tasks_lifecycle.py) — roda em thread separada via executor.
        await loop.run_in_executor(None, command.downgrade, alembic_cfg, "81de3361cd01")

        async with async_session_maker() as session:
            await session.execute(
                text(
                    "INSERT INTO api_token (id, user_id, token, created_at) "
                    "VALUES (:id, :user_id, :token, now())"
                ),
                {"id": token_id, "user_id": user.id, "token": raw},
            )
            await session.commit()

        await loop.run_in_executor(None, command.upgrade, alembic_cfg, "head")

        async with async_session_maker() as session:
            found = await get_valid_token(session, raw)
            assert found is not None
            assert found.id == token_id
            assert found.token_hash == hash_token(raw)
            assert found.token_sufixo == raw[-4:]
    finally:
        # garante o schema de volta em head mesmo se algo no meio falhar — a limpeza das
        # linhas fica por conta da fixture autouse, que só pode rodar com o schema atual.
        await loop.run_in_executor(None, command.upgrade, alembic_cfg, "head")
        await engine.dispose()  # descarta conexões que possam ter cacheado o schema antigo
