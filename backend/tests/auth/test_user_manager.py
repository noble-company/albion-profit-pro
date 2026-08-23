import pytest
from fastapi_users.exceptions import InvalidPasswordException, UserAlreadyExists

from src.auth.schemas import UserCreate
from tests.conftest import criar_usuario, unique_email


async def test_create_user_hashes_password_and_persists(db_session):
    email = unique_email()
    user = await criar_usuario(db_session, email=email, password="senha-super-secreta")

    assert user.email == email
    # a senha nunca deve ficar em texto plano no banco
    assert user.hashed_password != "senha-super-secreta"
    assert user.hashed_password.startswith("$")  # formato de hash (bcrypt/argon2)


async def test_create_user_rejects_duplicate_email(db_session):
    from fastapi_users.db import SQLAlchemyUserDatabase

    from src.auth.manager import UserManager
    from src.auth.models import User

    email = unique_email()
    await criar_usuario(db_session, email=email, password="senha-completa-1")

    user_db = SQLAlchemyUserDatabase(db_session, User)
    manager = UserManager(user_db)
    with pytest.raises(UserAlreadyExists):
        await manager.create(UserCreate(email=email, password="senha-completa-2"))


async def test_validate_password_rejects_short_password(db_session):
    with pytest.raises(InvalidPasswordException):
        await criar_usuario(db_session, password="curta123")


async def test_validate_password_rejects_password_containing_email(db_session):
    email = unique_email()
    with pytest.raises(InvalidPasswordException):
        await criar_usuario(db_session, email=email, password=f"minha-senha-{email}")


async def test_validate_password_accepts_valid_password(db_session):
    email = unique_email()
    user = await criar_usuario(db_session, email=email, password="senha-valida-123")
    assert user.email == email
