import uuid

from fastapi_users import BaseUserManager, UUIDIDMixin, exceptions, models, schemas

from src.auth.models import User
from src.config import get_settings

settings = get_settings()

SENHA_MIN_LENGTH = 10


class UserManager(UUIDIDMixin, BaseUserManager[User, uuid.UUID]):
    reset_password_token_secret = settings.reset_password_secret
    verification_token_secret = settings.verification_secret

    async def validate_password(self, password: str, user: schemas.UC | models.UP) -> None:
        """Task 33, achado P8: sem isso, `"senha123"` (6 caracteres) era aceito — inclusive
        pelos próprios testes. Só comprimento importa aqui, nenhuma regra de complexidade
        (símbolo obrigatório etc.) — é o que a spec pede de propósito."""
        if len(password) < SENHA_MIN_LENGTH:
            raise exceptions.InvalidPasswordException(
                reason=f"A senha precisa ter pelo menos {SENHA_MIN_LENGTH} caracteres."
            )
        if user.email and user.email.lower() in password.lower():
            raise exceptions.InvalidPasswordException(reason="A senha não pode conter o e-mail.")
