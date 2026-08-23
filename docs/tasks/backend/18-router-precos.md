# 18 — Router de leitura de preços

> ⚠️ **Spec revisada em 2026-08-22.** O código descrito aqui foi implementado fielmente, mas:
> - A chave de cache ignora `auction_type`, então **compra e venda se sobrescrevem**. Medido no
>   algodão T2: venda 37-39 silver, compra 1-35. Achado `C3` →
>   [task 29](29-precos-por-lado-e-profundidade.md).
> - O cache é lido **antes** do filtro de escopo, então `scope=mine` vaza dado de outro usuário
>   com cache quente. Achado `C5` → tasks [29](29-precos-por-lado-e-profundidade.md) e
>   [30](30-cobertura-por-usuario-e-escopo.md).
> - O loop 8 cidades × 5 qualidades faz **até 80 round-trips** no endpoint mais chamado do
>   sistema. Achado `M1` → [task 29](29-precos-por-lado-e-profundidade.md).
> - A lista `LOCATIONS` hardcoded **não casa com o dado real** — a captura trouxe
>   `"1000-HellDen"`, não códigos de 4 dígitos. Achado `N3` →
>   [task 28](28-tabela-item-e-localizacao.md).
>
> Este arquivo fica como **registro histórico**. Para o desenho atual, seguir as tasks 28, 29 e 30.


## Objetivo
`GET /items/{item_id}/prices?scope=all|mine` — o endpoint que a calculadora (frontend) consulta pra mostrar preço de compra/venda por cidade, lendo do cache Redis primeiro, com fallback pro Postgres.

## Por que
Esse é o endpoint de leitura mais chamado do sistema (toda vez que alguém abre a calculadora) — por isso o cache-first. `scope=all` mostra dados agregados de todos os usuários da plataforma; `scope=mine` filtra só o que o usuário logado coletou (decisão de produto já confirmada no plano macro).

## O que implementar
`src/prices/schemas.py`:
```python
from pydantic import BaseModel


class CityPrice(BaseModel):
    location_id: str
    quality_level: int
    price: int
    amount: int
    collected_at: str  # ISO — vem do cache (dict simples) ou serializado do Postgres


class ItemPricesOut(BaseModel):
    item_id: str
    scope: str  # "all" | "mine"
    prices: list[CityPrice]
```

`src/prices/service.py`:
```python
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.cache.redis_client import get_latest_price
from src.prices.models import MarketOrder

LOCATIONS = ["0301", "1002", "2004", "3005", "3008", "4002", "4006", "3003"]  # cidades — mover pra uma constante compartilhada de verdade, IDs reais a confirmar contra o mapdata do client


async def get_item_prices(session: AsyncSession, item_id: str, scope: str, user_id=None) -> list[dict]:
    results = []
    for location_id in LOCATIONS:
        for quality_level in range(1, 6):  # 1-5, qualidades do Albion
            cached = await get_latest_price(item_id, location_id, quality_level)
            if cached is not None:
                results.append({"location_id": location_id, "quality_level": quality_level, **cached})
                continue

            # fallback Postgres — pega a ordem mais recente pra essa combinação
            query = (
                select(MarketOrder)
                .where(
                    MarketOrder.item_id == item_id,
                    MarketOrder.location_id == location_id,
                    MarketOrder.quality_level == quality_level,
                )
                .order_by(MarketOrder.collected_at.desc())
                .limit(1)
            )
            if scope == "mine" and user_id is not None:
                query = query.where(MarketOrder.user_id == user_id)

            order = (await session.execute(query)).scalar_one_or_none()
            if order is not None:
                results.append({
                    "location_id": location_id,
                    "quality_level": quality_level,
                    "price": order.unit_price_silver,
                    "amount": order.amount,
                    "collected_at": order.collected_at.isoformat(),
                })
    return results
```

`src/prices/router.py`:
```python
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.dependencies import current_active_user
from src.database import get_session
from src.prices.schemas import ItemPricesOut
from src.prices.service import get_item_prices

router = APIRouter(prefix="/items", tags=["prices"])


@router.get("/{item_id}/prices", response_model=ItemPricesOut)
async def read_item_prices(
    item_id: str,
    scope: Literal["all", "mine"] = Query("all"),
    user=Depends(current_active_user),
    session: AsyncSession = Depends(get_session),
):
    prices = await get_item_prices(session, item_id, scope, user_id=user.id if scope == "mine" else None)
    return ItemPricesOut(item_id=item_id, scope=scope, prices=prices)
```

Nota de implementação a revisar: a varredura `LOCATIONS × 5 qualidades` (loop duplo) é aceitável pro MVP mas não é a consulta mais eficiente possível — uma versão futura pode trocar por uma única query agregada (`SELECT DISTINCT ON (location_id, quality_level) ...`) direto no Postgres pros cache-misses, em vez de N idas ao banco dentro do loop. Registrar como possível otimização, não bloqueia o MVP.

## Bibliotecas/dependências
Nenhuma nova.

## Depende de
Task 10 (`MarketOrder`), Task 14 (Redis).

## Testes manuais
1. Rodar o `curl` de ingest da task 16 pra popular algum dado.
2. `curl localhost:8000/items/T2_FIBER/prices?scope=all -H "Authorization: Bearer <jwt_do_login>"` → deve retornar o preço recém-inserido (do cache, já que acabou de ser gravado).
3. Esperar o TTL do cache expirar (ou testar direto no Postgres, apagando a chave do Redis manualmente) → o mesmo `curl` deve continuar funcionando via fallback Postgres.
4. Testar `scope=mine` com um usuário diferente de quem inseriu o dado → lista deve vir vazia pra essa combinação.

## Testes automatizados
- `tests/prices/test_router.py`: popula um `MarketOrder` de teste direto no banco, testa `scope=all` (deve aparecer) e `scope=mine` com outro `user_id` (não deve aparecer); testa cache-hit vs cache-miss (mockando/populando o Redis antes da chamada).
