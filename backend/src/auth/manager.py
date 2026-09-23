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
        """Exige comprimento mínimo e impede que o e-mail componha a senha."""
        if len(password) < SENHA_MIN_LENGTH:
            raise exceptions.InvalidPasswordException(
                reason=f"Password must be at least {SENHA_MIN_LENGTH} characters long."
            )
        if user.email and user.email.lower() in password.lower():
            raise exceptions.InvalidPasswordException(
                reason="Password must not contain the e-mail."
            )
