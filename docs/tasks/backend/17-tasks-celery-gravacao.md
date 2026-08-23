# 17 — Tasks Celery de gravação

> ⚠️ **Spec revisada em 2026-08-22.** O código descrito aqui foi implementado fielmente, mas
> três premissas dele estão erradas — confirmadas com dado real e revisão:
> - O `asyncio.run()` por task, recomendado em "Pontos de atenção" abaixo, **quebra o worker a
>   partir da 2ª mensagem** (engine/Redis são singletons de módulo, presos a um loop morto).
>   Achado `C1` → [task 23](23-ciclo-de-vida-async-worker.md).
> - O `INSERT` puro em `market_order` **não é o upsert** que o texto promete. Medido: 2,0× de
>   duplicação numa única visita ao mercado. Achado `C2` → [task 27](27-remodelar-market-order.md).
> - O `ON CONFLICT DO NOTHING` no histórico **congela o bucket em andamento** no valor parcial
>   da primeira leitura, e `timescale`/`user_id` não deveriam estar na chave.
>   Achados `N2`/`M7` → [task 26](26-remodelar-market-history.md).
> - O comentário "melhor preço" no bloco de cache descreve algo que o código não faz — ele
>   guarda o **primeiro** do lote. Achados `C3`/`C4` → [task 29](29-precos-por-lado-e-profundidade.md).
>
> Este arquivo fica como **registro histórico do que foi implementado**. Para o desenho atual,
> seguir as tasks 23, 26, 27 e 29.


## Objetivo
As 3 tasks Celery que o router de ingest (task 16) enfileira: consomem o payload validado, fazem upsert em lote no Postgres, atualizam o cache Redis e publicam no pub/sub.

## Por que
É aqui que o desacoplamento fila→banco realmente ganha valor: o worker processa no seu próprio ritmo, pode reprocessar em caso de falha (`task_acks_late=True`, task 13), e faz upsert em **lote** (uma query por payload inteiro, não uma por item) — essencial já que cada payload pode trazer 50+ ordens de mercado de uma vez.

## O que implementar
`src/ingest/tasks.py`:
```python
import asyncio

from sqlalchemy.dialects.postgresql import insert as pg_insert

from src.cache.redis_client import publish_price_update, set_latest_price
from src.celery_app import celery_app
from src.database import async_session_maker
from src.prices.models import MarketHistoryEntry, MarketOrder


def _run_async(coro):
    """Celery é síncrono por padrão — cada task abre seu próprio loop pra rodar a lógica async (SQLAlchemy/Redis)."""
    return asyncio.run(coro)


@celery_app.task(name="ingest.process_market_orders")
def process_market_orders(payload: dict, user_id: str) -> None:
    _run_async(_process_market_orders(payload, user_id))


async def _process_market_orders(payload: dict, user_id: str) -> None:
    orders = payload["orders"]
    if not orders:
        return

    async with async_session_maker() as session:
        rows = [
            {
                "source_id": o["id"],
                "item_id": o["item_id"],
                "group_type_id": o["group_type_id"],
                "location_id": o["location_id"],
                "quality_level": o["quality_level"],
                "enchantment_level": o["enchantment_level"],
                "unit_price_silver": o["unit_price_silver"],
                "amount": o["amount"],
                "auction_type": o["auction_type"],
                "expires": o["expires"],
                "user_id": user_id,
            }
            for o in orders
        ]
        await session.execute(pg_insert(MarketOrder).values(rows))  # insere lote inteiro numa query só
        await session.commit()

    # Atualiza cache/pub-sub só pro "melhor preço" por combinação única no lote (evita N publishes por 1 payload)
    seen = set()
    for o in orders:
        key = (o["item_id"], o["location_id"], o["quality_level"])
        if key in seen:
            continue
        seen.add(key)
        await set_latest_price(*key, payload={"price": o["unit_price_silver"], "amount": o["amount"]})
        await publish_price_update(o["item_id"], {"location_id": o["location_id"], "price": o["unit_price_silver"]})


@celery_app.task(name="ingest.process_market_history")
def process_market_history(payload: dict, user_id: str) -> None:
    _run_async(_process_market_history(payload, user_id))


async def _process_market_history(payload: dict, user_id: str) -> None:
    async with async_session_maker() as session:
        rows = [
            {
                "item_id": payload["albion_id"],
                "location_id": payload["location_id"],
                "quality_level": payload["quality_level"],
                "timescale": payload["timescale"],
                "item_amount": h["item_amount"],
                "silver_amount": h["silver_amount"],
                "timestamp": h["timestamp"],
                "user_id": user_id,
            }
            for h in payload["histories"]
        ]
        if not rows:
            return
        stmt = pg_insert(MarketHistoryEntry).values(rows)
        stmt = stmt.on_conflict_do_nothing(
            index_elements=["item_id", "location_id", "quality_level", "timescale", "timestamp", "user_id"]
        )
        await session.execute(stmt)
        await session.commit()


@celery_app.task(name="ingest.process_gold_prices")
def process_gold_prices(payload: dict, user_id: str) -> None:
    _run_async(_process_gold_prices(payload, user_id))


async def _process_gold_prices(payload: dict, user_id: str) -> None:
    ...  # mesmo padrão — tabela gold_price fica fora do escopo do MVP da calculadora de crafting,
         # registrar como pendência: criar Modelo GoldPrice (mesma forma de MarketHistoryEntry) quando for priorizado
```

Pontos de atenção:
- **`asyncio.run()` dentro de cada task**: Celery é síncrono por natureza (o próprio motivo de precisarmos pinar Python 3.13 em vez de usar Taskiq async-nativo) — cada task cria seu próprio event loop pra rodar a lógica assíncrona (SQLAlchemy async, Redis async). Isso é o padrão aceito pra misturar Celery com bibliotecas async; não tentar rodar um loop persistente entre tasks (complica sem necessidade aqui).
- **`ON CONFLICT DO NOTHING`** no histórico (idempotência — reprocessar o mesmo payload duas vezes, por retry, não duplica).
- `process_gold_prices` deixado como esqueleto — não é bloqueio do MVP de crafting/refino, mas o tópico existe e o client já manda, então o endpoint (task 16) precisa aceitar e não falhar; implementação completa fica registrada como pendência dentro desta mesma task quando for priorizada.

## Bibliotecas/dependências
Nenhuma nova.

## Depende de
Task 10 (`MarketOrder`), Task 11 (`MarketHistoryEntry`), Task 13 (Celery), Task 14 (Redis).

## Testes manuais
1. Com worker rodando, enviar o `curl` de exemplo da task 16 → conferir no Postgres (`SELECT * FROM market_order`) que a linha foi gravada.
2. `redis-cli GET "price:T2_FIBER:1002:1"` → confirma que o cache foi atualizado.
3. Simular falha (derrubar o Postgres momentaneamente, mandar um payload, subir o Postgres de novo) → com `task_acks_late=True`, a task deve reaparecer na fila e ser reprocessada, não perdida.

## Testes automatizados
- `tests/ingest/test_tasks.py`: com Postgres/Redis via testcontainers e `task_always_eager=True`, testa que `process_market_orders` grava o lote inteiro numa query, atualiza o cache pra cada combinação única, e que rodar a mesma task duas vezes com o mesmo histórico não duplica linhas (idempotência do `ON CONFLICT DO NOTHING`).
