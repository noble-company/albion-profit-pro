# 26 — Remodelar `market_history_entry`: bucket global e idempotente

> Corrige **N2**, **M7** e o `ON CONFLICT DO NOTHING` da task 17.
> Base empírica em [../../03-contrato-ingest-real.md](../../03-contrato-ingest-real.md) seção 3.

## Objetivo
Transformar `market_history_entry` na tabela-fato **global** do histórico de mercado: uma linha
por (item, local, qualidade, tamanho de bucket, início do bucket), com upsert que corrige o
bucket em andamento.

## Por que

### `Timescale` não é identidade
Medido no jogo: as três "escalas" do protocolo são **a mesma série**, em janelas diferentes.

| `Timescale` | Janela | Bucket real | Pontos |
|---|---|---|---|
| `0` | 24 h | **1 hora** | 25 |
| `1` | 7 dias | **6 horas** | 29 |
| `2` | 28 dias | **6 horas** | 113 |

Dos 29 timestamps que as escalas 1 e 2 têm em comum, **29/29 trazem valores idênticos**. E os
buckets de 1 h somam exatos nos de 6 h.

Logo, `timescale` descreve *como perguntamos*, não *o que o dado é*. Mantê-lo na constraint
única faz **um único usuário abrindo as três abas gravar 29 linhas duplicadas** — antes de
multiplicar por N usuários. A identidade correta é o **tamanho do bucket**.

### `user_id` na chave impede a série global
O histórico é autoritativo do servidor do jogo: todo player que consultar o mesmo
item/cidade/qualidade recebe **exatamente os mesmos números**. Com `user_id` na constraint,
50 usuários coletando = 50 linhas byte-a-byte idênticas por bucket, e qualquer agregação conta
50×. A procedência ("o que *eu* coletei") passa a ser resolvida pela tabela de cobertura da
task 30, não duplicando o fato.

### `DO NOTHING` congela o bucket em andamento
Este é o mais sutil: **o bucket corrente é parcial** e cresce ao longo do período. Se o primeiro
scan pega o bucket das 12h com `item_amount=40` e o `DO NOTHING` grava isso, todo scan
posterior daquele mesmo bucket é descartado — o período fica **permanentemente travado no valor
parcial da primeira leitura**. Tem que ser `DO UPDATE`.

## O que implementar

### Modelo
```python
class MarketHistoryEntry(Base):
    __tablename__ = "market_history_entry"
    __table_args__ = (
        UniqueConstraint(
            "item_id", "location_id", "quality_level", "bucket_seconds", "bucket_start",
            name="uq_market_history_bucket",
        ),
        Index("ix_market_history_lookup",
              "item_id", "location_id", "quality_level", "bucket_seconds", "bucket_start"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    item_id: Mapped[int] = mapped_column(BigInteger, index=True)   # AlbionId (Index numerico)
    location_id: Mapped[str] = mapped_column(String(64), index=True)  # ver task 28
    quality_level: Mapped[int]

    # 3600 (Timescale=0) ou 21600 (Timescale=1 e 2) -- ver docs/03 secao 3.
    # Substitui a antiga coluna `timescale`, que nao era propriedade do dado.
    bucket_seconds: Mapped[int]
    bucket_start: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    item_amount: Mapped[int] = mapped_column(BigInteger)
    silver_amount: Mapped[Decimal] = mapped_column(Numeric(20, 4))  # ja em silver real, task 25

    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
```

Sai: `timescale`, `timestamp` (tick cru), `user_id`, `is_public`, `collected_at`.

### Mapeamento de `Timescale` → `bucket_seconds`
```python
BUCKET_POR_TIMESCALE = {0: 3600, 1: 21600, 2: 21600}
```
Deixar explícito no código que 1 e 2 colapsam de propósito, com referência ao docs/03.

### Upsert
```python
stmt = pg_insert(MarketHistoryEntry).values(rows)
stmt = stmt.on_conflict_do_update(
    constraint="uq_market_history_bucket",
    set_={
        "item_amount": stmt.excluded.item_amount,
        "silver_amount": stmt.excluded.silver_amount,
        "last_seen_at": func.now(),
    },
)
```

**Atenção à deduplicação dentro do lote:** o Postgres recusa `ON CONFLICT` quando a mesma
linha aparece duas vezes no mesmo `INSERT` (`ON CONFLICT DO UPDATE command cannot affect row a
second time`). Como os timestamps **não vêm ordenados** e um payload pode repetir bucket, é
preciso deduplicar as `rows` em Python antes (dict por chave, último vence).

## Bibliotecas/dependências
Nenhuma nova.

## Depende de
Tasks 23 e 25. A task 31 (retenção/rollup) depende desta.

## Testes manuais
1. Enviar `tests/fixtures/wire/markethistories-real-t2fiber-ts2.json` → 113 linhas com
   `bucket_seconds=21600`.
2. Enviar o **mesmo** payload de novo → continua 113 linhas, `last_seen_at` atualizado.
3. Simular um bucket parcial: enviar um payload com um ponto de `item_amount` menor pro mesmo
   `bucket_start`, depois com o valor maior → a linha final tem o **valor maior** (prova o
   `DO UPDATE` corrigindo o bucket em andamento).

## Testes automatizados
- Ler as fixtures reais e afirmar `bucket_seconds` correto por `Timescale`.
- **Teste do colapso 1↔2**: gravar um payload `Timescale=1` e outro `Timescale=2` com buckets
  sobrepostos → afirmar que o total de linhas é a **união**, não a soma (é o teste que prova o
  N2 corrigido).
- Idempotência: mesmo payload 2× → contagem estável.
- Correção de bucket parcial: mesmo `bucket_start`, `item_amount` crescente → valor final é o
  último enviado.
- Dedup intra-lote: payload com o mesmo bucket repetido não levanta erro do Postgres.
