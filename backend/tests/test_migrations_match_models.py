"""Task 3.6/09 (E08): `Base.metadata` tem que bater com o banco migrado. Se divergir, o
próximo `alembic revision --autogenerate` propõe um `op.drop_index`/`op.alter_column` que
ninguém pediu -- e se passar despercebido numa revisão de rotina, o índice que sustenta uma
consulta quente desaparece em produção sem aviso nenhum.
"""

from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import create_async_engine

# Precisa de TODOS os módulos de modelos importados, senão o autogenerate não os enxerga --
# mesma lista e mesmo motivo de `alembic/env.py`.
from src.api_tokens import models as _api_token_models  # noqa: F401
from src.auth import models as _auth_models  # noqa: F401
from src.config import get_settings
from src.database import Base
from src.destiny import models as _destiny_models  # noqa: F401
from src.items import models as _items_models  # noqa: F401
from src.prices import models as _prices_models  # noqa: F401
from src.quarantine import models as _quarantine_models  # noqa: F401
from src.recipes import models as _recipes_models  # noqa: F401
from src.saved_crafts import models as _saved_crafts_models  # noqa: F401
from src.static_data import models as _static_data_models  # noqa: F401


def _diff(sync_connection) -> list:
    migration_context = MigrationContext.configure(sync_connection)
    return compare_metadata(migration_context, Base.metadata)


async def test_metadata_matches_migrated_schema_with_no_drift():
    engine = create_async_engine(get_settings().database_url, poolclass=pool.NullPool)
    try:
        async with engine.connect() as connection:
            diff = await connection.run_sync(_diff)
    finally:
        await engine.dispose()
    assert diff == [], (
        "Base.metadata diverge do banco migrado -- o próximo `alembic revision "
        f"--autogenerate` proporia: {diff}"
    )
