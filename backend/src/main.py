import structlog
from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from starlette.middleware.base import BaseHTTPMiddleware

from src.api_tokens.router import client_router
from src.api_tokens.router import router as api_tokens_router
from src.auth.router import router as auth_router
from src.cache.redis_client import get_redis
from src.config import get_settings
from src.database import async_session_maker
from src.ingest.router import router as ingest_router
from src.logging_config import configure_logging
from src.prices.router import router as prices_router

configure_logging()

log = structlog.get_logger()
settings = get_settings()

MAX_CONTENT_LENGTH = 10 * 1024 * 1024  # 10 MB (task 33, achado A6)


class LimitarTamanhoDoCorpo(BaseHTTPMiddleware):
    """Rejeita pelo `Content-Length` antes do corpo ser parseado — sem isso, um JSON
    gigante consome CPU/memória só pra ser rejeitado depois pelo limite do schema
    (`max_length` em src/ingest/schemas.py), que já leu o corpo inteiro."""

    async def dispatch(self, request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length is not None and int(content_length) > MAX_CONTENT_LENGTH:
            return JSONResponse(status_code=413, content={"detail": "Payload muito grande"})
        return await call_next(request)


app = FastAPI(title="Albion Profit Pro API")
app.add_middleware(LimitarTamanhoDoCorpo)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# api_tokens_router precisa ser registrado ANTES de auth_router: o
# fastapi-users users-router (dentro de auth_router) expõe GET/DELETE
# /auth/{id}, e o Starlette casa rotas na ordem de registro — se auth_router
# entrasse primeiro, "/auth/tokens" seria capturado por "/auth/{id}"
# (tratando "tokens" como se fosse o {id}), retornando 403 (rota exige
# superusuário) em vez de cair no router de tokens.
app.include_router(api_tokens_router)
app.include_router(auth_router)
app.include_router(client_router)
app.include_router(ingest_router)
app.include_router(prices_router)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Payload rejeitado (422) — ex: client Go mandando algo fora do contrato — deixa de
    desaparecer sem rastro (ver task 24, docs/04-revisao-fase-1.md, achado A5)."""
    log.warning("ingest.payload_rejeitado", path=request.url.path, errors=exc.errors())
    return JSONResponse(status_code=422, content=jsonable_encoder({"detail": exc.errors()}))


@app.get("/health")
async def health():
    """Só confirma que o processo está de pé — não checa dependências externas."""
    return {"status": "ok"}


@app.get("/ready")
async def ready():
    """Confirma que Postgres e Redis estão acessíveis — usado pelo orquestrador pra decidir se roteia tráfego."""
    checks = {}

    try:
        async with async_session_maker() as session:
            await session.execute(text("SELECT 1"))
        checks["postgres"] = "ok"
    except Exception:
        # detalhe completo (host/usuário/DSN podem vazar em str(exc)) só no log — o
        # endpoint não é autenticado (task 33, achado A3)
        log.error("ready.postgres_falhou", exc_info=True)
        checks["postgres"] = "erro"

    try:
        await get_redis().ping()
        checks["redis"] = "ok"
    except Exception:
        log.error("ready.redis_falhou", exc_info=True)
        checks["redis"] = "erro"

    all_ok = all(v == "ok" for v in checks.values())
    status_code = 200 if all_ok else 503
    return JSONResponse(content=checks, status_code=status_code)
