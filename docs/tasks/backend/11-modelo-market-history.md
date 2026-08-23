# 11 — Modelo MarketHistory

## Objetivo
Tabela `market_history` espelhando o `lib.MarketHistoriesUpload`/`lib.MarketHistory` do client Go — série temporal de preço/quantidade por item, usada pra gráficos de tendência (não bloqueia o MVP da calculadora básica, mas é parte da Fase 1 do plano macro).

## Por que
Diferente do `MarketOrder` (snapshot do mercado agora), esse dado já vem em formato de série temporal do próprio jogo (`opAuctionGetItemAverageStats`) — cada upload já traz um lote de pontos `(timestamp, quantidade, prata)` pra um item/qualidade/timescale específico.

## O que implementar
`src/prices/models.py` (mesmo arquivo da task 10, adicionar):
```python
class MarketHistoryEntry(Base):
    __tablename__ = "market_history_entry"
    __table_args__ = (
        Index(
            "ix_market_history_item_location_quality_timescale",
            "item_id", "location_id", "quality_level", "timescale",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)

    item_id: Mapped[int] = mapped_column(BigInteger, index=True)  # AlbionId (int32 no Go, aqui BigInteger por folga)
    location_id: Mapped[str] = mapped_column(String(16), index=True)  # LocationId
    quality_level: Mapped[int]  # QualityLevel (uint8 no Go)
    timescale: Mapped[int]      # Timescale (0=Hours, 1=Days, 2=Weeks — inteiro puro, igual ao wire do Go)

    item_amount: Mapped[int] = mapped_column(BigInteger)   # ItemAmount
    silver_amount: Mapped[int] = mapped_column(BigInteger) # SilverAmount
    timestamp: Mapped[int] = mapped_column(BigInteger)     # Timestamp (epoch do jogo, confirmar unidade na task 17 ao gravar de verdade)

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id"), nullable=False, index=True)
    is_public: Mapped[bool] = mapped_column(default=True)

    collected_at: Mapped[datetime] = mapped_column(server_default=func.now())
```

Notas:
- Uma linha por ponto de dado (`ItemAmount`/`SilverAmount`/`Timestamp`), não por upload inteiro — o worker (task 17) itera a lista `Histories` do payload e insere uma linha por entrada, todas com o mesmo `item_id`/`location_id`/`quality_level`/`timescale` do envelope `MarketHistoriesUpload`.
- Recomendo **constraint de unicidade** em `(item_id, location_id, quality_level, timescale, timestamp, user_id)` pra permitir `ON CONFLICT DO NOTHING`/upsert idempotente — o mesmo período histórico pode chegar repetido de uploads diferentes.

## Bibliotecas/dependências
Nenhuma nova.

## Depende de
Task 10 (mesmo arquivo `models.py`), Task 06 (Alembic).

## Testes manuais
1. `uv run alembic revision --autogenerate -m "add market_history_entry table"` → gerar e revisar a migration.
2. `uv run alembic upgrade head`.
3. Inserir um lote de teste (simulando uma `MarketHistoriesUpload` desserializada) e confirmar que a constraint de unicidade rejeita duplicata exata.

## Testes automatizados
- `tests/prices/test_market_history_model.py`: insere uma entrada, tenta inserir a mesma combinação `(item_id, location_id, quality_level, timescale, timestamp, user_id)` de novo, confirma que a constraint de unicidade impede duplicata (ou que o upsert com `ON CONFLICT DO NOTHING` não gera erro nem duplica linha).

## Notas de implementação (2026-08-21)
1. **A `UniqueConstraint` foi declarada de verdade no `__table_args__`** — o snippet original só tinha a recomendação em texto, sem o código. Sem ela, o `ON CONFLICT DO NOTHING(index_elements=[...])` que a task 17 usa quebraria em runtime (Postgres exige um índice/constraint único casando exatamente com os `index_elements`, senão dá erro "no unique or exclusion constraint matching the ON CONFLICT specification").
2. **Bug real de SQLAlchemy encontrado no teste**: depois de um `session.rollback()` (usado pra testar que a `UniqueConstraint` rejeita duplicata), o SQLAlchemy expira os atributos de todos os objetos daquela sessão — inclusive `user`. Acessar `user.id` de novo *fora* de um `await` (ex: ao montar `delete(...).where(MarketHistoryEntry.user_id == user.id)` na limpeza) dispara um lazy-load síncrono que quebra com `MissingGreenlet` em sessão async. **Correção**: capturar `user_id = user.id` logo após criar o usuário, e usar essa variável (não `user.id` de novo) depois de qualquer rollback. Vale ter em mente pra qualquer teste futuro que faça rollback no meio.
