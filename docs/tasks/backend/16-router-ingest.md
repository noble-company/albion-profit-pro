# 16 — Router de ingest

## Objetivo
Os 3 endpoints que o client Go efetivamente chama hoje: `POST /marketorders.ingest`, `POST /markethistories.ingest`, `POST /goldprices.ingest`. Autentica via `ApiToken`, enfileira a task Celery correspondente, e responde rápido (sem esperar o banco).

## Por que
Esse é o ponto de entrada de todo o pipeline — junta autenticação (task 08), schemas (task 15) e fila (task 13) numa API real. **O path precisa ser exatamente o nome do tópico** (incluindo o ponto), porque o client monta a URL como `baseURL + "/" + topic` sem nenhuma flexibilidade (`client/uploader_http.go:30`) — não dá pra usar um path diferente tipo `/ingest/market-orders`.

## O que implementar
`src/ingest/router.py`:
```python
from fastapi import APIRouter, Depends

from src.api_tokens.models import ApiToken
from src.api_tokens.dependencies import require_api_token  # movida de service.py pra dependencies.py na task 08, se ainda não estiver
from src.ingest.schemas import GoldPricesUploadIn, MarketHistoriesUploadIn, MarketUploadIn
from src.ingest.tasks import process_gold_prices, process_market_history, process_market_orders

router = APIRouter(tags=["ingest"])


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
```

Pontos de atenção pra implementação:
- **Status code deve ser exatamente 200** (não 201/202) — confirmado que o client só aceita `resp.StatusCode == 200` (`client/uploader_http.go:46`), qualquer outra coisa é tratada como erro e descartada sem retry.
- **Responder rápido**: `task.delay(...)` do Celery só publica na fila (operação rápida, não espera o worker processar) — o endpoint não faz nenhuma query no Postgres, só valida o payload e enfileira. Isso é o que absorve os picos de rajada do client.
- `token.user_id` é passado pra task pra sabermos de quem é o dado (campo `user_id`/`is_public` do `MarketOrder`, task 10).
- Registrar o router em `src/main.py` junto com `auth_router`/`api_tokens_router` (task 09).

## Bibliotecas/dependências
Nenhuma nova — usa o que as tasks 08/13/15 já trouxeram.

## Depende de
Task 08 (auth do token), Task 13 (Celery), Task 15 (schemas). A task 17 (as próprias tasks Celery) pode ser feita em paralelo ou logo depois — este router referencia `process_market_orders` etc. que a task 17 implementa.

## Testes manuais
1. Gerar um `ApiToken` de teste (via endpoint da task 09).
2. Com a API e o worker rodando:
   ```bash
   curl -X POST localhost:8000/marketorders.ingest \
     -H "Authorization: Bearer apk_..." \
     -H "Content-Type: application/json" \
     -d '{"Orders":[{"Id":1,"ItemTypeId":"T2_FIBER","ItemGroupTypeId":"","LocationId":"1002","QualityLevel":1,"EnchantmentLevel":0,"UnitPriceSilver":100,"Amount":50,"AuctionType":"offer","Expires":"2026-08-22T00:00:00"}]}'
   ```
   → deve responder `200` na hora (sem delay perceptível), e a task deve aparecer no log do worker logo em seguida.
3. Testar sem header `Authorization` → 401.
4. Testar com JSON malformado (ex: `QualityLevel` como string) → 422 (validação do Pydantic).

## Testes automatizados
- `tests/ingest/test_router.py`: usa `celery_app.conf.task_always_eager = True` (task 13) pra rodar a task na hora dentro do teste (sem precisar de worker/RabbitMQ real rodando em paralelo) — testa os 3 endpoints com payload válido (200 + task disparada), sem token (401), payload inválido (422).
