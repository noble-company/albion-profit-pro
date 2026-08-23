from fastapi import APIRouter, Depends

from src.auth.dependencies import auth_backend, fastapi_users
from src.auth.schemas import UserCreate, UserRead, UserUpdate
from src.rate_limit import rate_limit

router = APIRouter(prefix="/auth", tags=["auth"])

# Por IP (default de `rate_limit`), não por token — login/registro acontecem antes de
# qualquer token existir (task 33, achado A6). Mesmo bucket_key pras duas rotas: o path
# entra na chave, então elas não dividem o mesmo orçamento.
_login_rate_limit = Depends(rate_limit("rl:auth", limit=10, seconds=60))

router.include_router(
    fastapi_users.get_auth_router(auth_backend),  # POST /auth/login, /auth/logout
    dependencies=[_login_rate_limit],
)
router.include_router(
    fastapi_users.get_register_router(UserRead, UserCreate),  # POST /auth/register
    dependencies=[_login_rate_limit],
)
router.include_router(fastapi_users.get_users_router(UserRead, UserUpdate))  # GET/PATCH /auth/me
