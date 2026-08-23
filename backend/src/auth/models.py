from fastapi_users.db import SQLAlchemyBaseUserTableUUID

from src.database import Base


class User(SQLAlchemyBaseUserTableUUID, Base):
    """Herda id (UUID), email, hashed_password, is_active, is_superuser, is_verified do fastapi-users."""
