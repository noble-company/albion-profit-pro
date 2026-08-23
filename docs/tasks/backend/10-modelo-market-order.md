# 10 — Modelo MarketOrder

## Objetivo
Tabela `market_order` no Postgres, espelhando 1:1 o `lib.MarketOrder` do client Go, mais os campos de dono/visibilidade (`user_id`, `is_public`) que o client não manda mas o backend precisa pra separar dados "meus" vs "de todos".

## Por que
Esse é o dado central da calculadora — preço de compra/venda por item/cidade/qualidade. Schema espelhando o Go evita qualquer tradução/mapeamento manual de campo na hora de gravar o que chega do ingest (task 17).

## O que implementar
`src/prices/models.py`:
```python
import uuid
from datetime import datetime

from sqlalchemy import BigInteger, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from src.database import Base


class MarketOrder(Base):
    __tablename__ = "market_order"
    __table_args__ = (
        Index("ix_market_order_item_location_quality", "item_id", "location_id", "quality_level"),
    )

    # ID do Go (`Id`) não é globalmente único entre servidores/tópicos — usamos PK própria,
    # e guardamos o Id original só como referência.
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    source_id: Mapped[int] = mapped_column(BigInteger)  # campo "Id" do JSON (lib.MarketOrder.ID)

    item_id: Mapped[str] = mapped_column(String(64), index=True)         # ItemTypeId
    group_type_id: Mapped[str] = mapped_column(String(64))                # ItemGroupTypeId
    location_id: Mapped[str] = mapped_column(String(16), index=True)     # LocationId
    quality_level: Mapped[int]                                            # QualityLevel
    enchantment_level: Mapped[int]                                        # EnchantmentLevel
    unit_price_silver: Mapped[int] = mapped_column(BigInteger)            # UnitPriceSilver
    amount: Mapped[int]                                                   # Amount
    auction_type: Mapped[str] = mapped_column(String(16))                 # AuctionType ("offer"/"request")
    expires: Mapped[str] = mapped_column(String(32))                      # Expires (string ISO, como o Go manda)

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id"), nullable=False, index=True)
    is_public: Mapped[bool] = mapped_column(default=True)

    collected_at: Mapped[datetime] = mapped_column(server_default=func.now(), index=True)
```

Notas de design:
- **Sem `unique constraint` em `(item_id, location_id, quality_level, auction_type)`** por padrão — mercado tem múltiplas ordens simultâneas pro mesmo item/cidade (várias pessoas vendendo o mesmo item a preços diferentes). O que a calculadora vai querer é o **preço mais recente/melhor** por combinação, calculado na leitura (task 18), não uma linha única por item. Se o volume de dados crescer muito, uma otimização futura seria manter só as N ordens mais recentes por combinação e podar o resto — registrar isso como nota, não implementar ainda.
- `Index` composto em `(item_id, location_id, quality_level)` — é exatamente o padrão de consulta da calculadora (task 18).
- `collected_at` indexado — útil pra podar/consultar por recência depois.

## Bibliotecas/dependências
Nenhuma nova.

## Depende de
Task 07 (precisa da tabela `user` pra `ForeignKey`), Task 06 (Alembic).

## Testes manuais
1. `uv run alembic revision --autogenerate -m "add market_order table"` (lembrar de importar `src.prices.models` no `env.py` do Alembic, task 06) → confere que a migration gerada tem os campos certos.
2. `uv run alembic upgrade head` → tabela criada sem erro.
3. Inserir uma linha manualmente via `psql`/script Python e consultar de volta — confirma tipos/constraints.

## Testes automatizados
- `tests/prices/test_market_order_model.py`: cria um `MarketOrder` de teste no banco (via fixture testcontainers), confirma que os índices existem (`\d market_order` ou introspection do SQLAlchemy) e que o insert/select básico funciona.

## Notas de implementação (2026-08-21)
Sem surpresas nesta task — o fix do template do Alembic (task 07/08) já resolveu o import do `fastapi_users_db_sqlalchemy` de cara, sem precisar de correção manual na migration. Testes seguem o padrão `tests.utils.run_async` já estabelecido (roda contra Postgres local do docker-compose, testcontainers só na task 20). Índices confirmados tanto manualmente (`\d market_order`) quanto via `inspect()` do SQLAlchemy (rodado dentro de `conn.run_sync(...)`, já que `inspect()` precisa de conexão síncrona).
