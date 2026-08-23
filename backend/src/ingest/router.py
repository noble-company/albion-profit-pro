import structlog
from fastapi import APIRouter, Depends, Request

from src.api_tokens.dependencies import require_api_token
from src.api_tokens.models import ApiToken
from src.ingest.schemas import GoldPricesUploadIn, MarketHistoriesUploadIn, MarketUploadIn
from src.ingest.tasks import process_gold_prices, process_market_history, process_market_orders
from src.rate_limit import identificar_por_token, rate_limit

log = structlog.get_logger()

# Por token, não por IP: vários usuários legítimos do client Go podem sair do mesmo NAT
# (achado A6). Generoso — a captura real mostrou 4 POSTs em ~10s numa única visita ao
# mercado; 120/min dá folga de sobra sem deixar o limite solto.
router = APIRouter(
    tags=["ingest"],
    dependencies=[
        Depends(rate_limit("rl:ingest", limit=120, seconds=60, identifier=identificar_por_token))
    ],
)


@router.post("/marketorders.ingest", status_code=200)
async def ingest_market_orders(
    payload: MarketUploadIn,
    token: ApiToken = Depends(require_api_token),
):
    process_market_orders.delay(payload.model_dump(by_alias=False), user_id=str(token.user_id))
    return {}  # client só checa status_code == 200, corpo não importa


@router.post("/markethistories.ingest", status_code=200)
async def ingest_market_history(
    payload: MarketHistoriesUploadIn,
    token: ApiToken = Depends(require_api_token),
):
    process_market_history.delay(payload.model_dump(by_alias=False), user_id=str(token.user_id))
    return {}


@router.post("/goldprices.ingest", status_code=200)
async def ingest_gold_prices(
    payload: GoldPricesUploadIn,
    token: ApiToken = Depends(require_api_token),
):
    process_gold_prices.delay(payload.model_dump(by_alias=False), user_id=str(token.user_id))
    return {}


# O client publica 6 tópicos no canal público; consumimos 3. Sem estas rotas, os outros
# viram 404 a cada evento e poluem o albiondata-client.log do usuário — justamente o log
# que ele vai colar quando pedir ajuda (achado F5, docs/tasks/client/README.md). Confirmado
# ao vivo em 2026-08-23: `mapdata.ingest` chegou numa sessão normal de jogo, sem nenhuma
# ação especial (payload real em tests/fixtures/wire/mapdata-real-5003.json).
TOPICOS_NAO_CONSUMIDOS = ("mapdata", "banditevent", "festivities")


async def _ingest_topico_nao_consumido(
    request: Request,
    token: ApiToken = Depends(require_api_token),
):
    """Aceita, registra e descarta. Mesmo espírito de `process_gold_prices`: responder 200 e
    logar o descarte é melhor que 404 (barulho no client) ou que sumir com o dado em
    silêncio (achado A5 da revisão da Fase 1).

    O corpo **não é lido nem parseado** de propósito — não vale escrever schema pra dado que
    descartamos, e o middleware `LimitarTamanhoDoCorpo` (src/main.py) já rejeita acima de
    10 MB antes de qualquer parse.
    """
    log.warning(
        "ingest.descartado",
        topico=request.url.path.lstrip("/").removesuffix(".ingest"),
        user_id=str(token.user_id),
        motivo="topico nao consumido",
        content_length=request.headers.get("content-length"),
    )
    return {}


# Registradas explicitamente, uma a uma, em vez de por uma rota curinga `/{topico}.ingest`:
# curinga capturaria `/marketorders.ingest` se fosse declarado antes (Starlette casa na ordem
# de registro) e transformaria um erro de digitação num 200 silencioso. Tópico desconhecido
# tem que continuar dando 404.
for _topico in TOPICOS_NAO_CONSUMIDOS:
    router.add_api_route(
        f"/{_topico}.ingest",
        _ingest_topico_nao_consumido,
        methods=["POST"],
        status_code=200,
        name=f"ingest_{_topico}_descartado",
    )
