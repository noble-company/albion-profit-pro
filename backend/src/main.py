import structlog
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select, text
from starlette.datastructures import Headers
from starlette.middleware.body_limit import RequestBodyLimitMiddleware
from starlette.types import ASGIApp, Receive, Scope, Send

from src.api_tokens.router import client_router
from src.api_tokens.router import router as api_tokens_router
from src.auth.router import router as auth_router
from src.cache.redis_client import get_redis
from src.catalog.router import router as catalog_router
from src.config import get_settings
from src.craft.router import router as craft_router
from src.database import async_session_maker
from src.ingest.router import router as ingest_router
from src.items.router import router as items_router
from src.logging_config import configure_logging
from src.opportunities.router import router as opportunities_router
from src.prices.router import router as prices_router
from src.prices.router import snapshot_router as prices_snapshot_router
from src.readiness import check_rabbitmq
from src.recipes.router import router as recipes_router
from src.static_data.models import StaticDatasetVersion

configure_logging()

log = structlog.get_logger()
settings = get_settings()

MAX_CONTENT_LENGTH = 10 * 1024 * 1024


class ValidarContentLengthMiddleware:
    """Rejeita o header malformado; o middleware oficial abaixo mede o corpo real."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http":
            content_length = Headers(scope=scope).get("content-length")
            if content_length is not None and not content_length.isdigit():
                response = JSONResponse(
                    status_code=400,
                    content={"detail": "Content-Length inválido"},
                )
                await response(scope, receive, send)
                return
        await self.app(scope, receive, send)


app = FastAPI(title="Albion Profit Pro API")
app.add_middleware(RequestBodyLimitMiddleware, max_body_size=MAX_CONTENT_LENGTH)
app.add_middleware(ValidarContentLengthMiddleware)
# O catálogo de receitas (task 4/02) é a maior resposta do produto — ~1 MB cru, e o cliente
# baixa o conjunto inteiro de propósito. `minimum_size` deixa as respostas pequenas em paz.
app.add_middleware(GZipMiddleware, minimum_size=1024)
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
# Receita específica vem antes das demais rotas sob `/items/{unique_name}`.
app.include_router(recipes_router)
# Rotas estáticas de catálogo precisam vir antes de `prices_router`, cujo prefixo contém
# parâmetros dinâmicos em `/items/{item_id}/...`.
app.include_router(items_router)
app.include_router(catalog_router)
app.include_router(prices_snapshot_router)
app.include_router(prices_router)
app.include_router(craft_router)
app.include_router(opportunities_router)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Payload rejeitado (422) — ex: client Go mandando algo fora do contrato — deixa de
    desaparecer sem rastro."""
    # `exc.errors()` também inclui o valor bruto em `input`; não o logamos nem devolvemos,
    # pois um campo inválido pode conter token/senha ou um corpo hostil enorme.
    safe_errors = [
        {
            "loc": list(error["loc"]),
            "type": error["type"],
            "msg": error["msg"],
        }
        for error in exc.errors()
    ]
    log.warning(
        "ingest.payload_rejeitado",
        method=request.method,
        path=request.url.path,
        errors=safe_errors,
    )
    return JSONResponse(status_code=422, content={"detail": safe_errors})


@app.get("/health")
async def health():
    """Só confirma que o processo está de pé — não checa dependências externas."""
    return {"status": "ok"}


@app.get("/ready")
async def ready():
    """Confirma as dependências obrigatórias antes de o orquestrador rotear tráfego."""
    checks = {}

    try:
        async with async_session_maker() as session:
            await session.execute(text("SELECT 1"))
            dataset_active = await session.scalar(
                select(StaticDatasetVersion.id)
                .where(StaticDatasetVersion.active.is_(True))
                .limit(1)
            )
        checks["postgres"] = "ok"
        checks["dataset"] = "ok" if dataset_active is not None else "ausente"
    except Exception:
        # detalhe completo (host/usuário/DSN podem vazar em str(exc)) só no log — o
        # O endpoint não é autenticado; detalhes internos ficam somente no log.
        log.error("ready.postgres_falhou", exc_info=True)
        checks["postgres"] = "erro"
        checks["dataset"] = "erro"

    try:
        await get_redis().ping()
        checks["redis"] = "ok"
    except Exception:
        log.error("ready.redis_falhou", exc_info=True)
        checks["redis"] = "erro"

    try:
        await check_rabbitmq()
        checks["rabbitmq"] = "ok"
    except Exception:
        log.error("ready.rabbitmq_falhou", exc_info=True)
        checks["rabbitmq"] = "erro"

    all_ok = all(v == "ok" for v in checks.values())
    status_code = 200 if all_ok else 503
    return JSONResponse(content=checks, status_code=status_code)
