# 31 — Retenção, rollup mensal e endpoint de demanda

> Implementa as **decisões de produto nº 2 e nº 3** de
> [../../04-revisao-fase-1.md](../../04-revisao-fase-1.md).
>
> **Contrato do objeto `livro` supersedido pela Fase 2.5/Task 12:** os nomes e metadados atuais
> estão documentados no doc 03 §11; não usar o exemplo histórico com `varredura_em` abaixo para
> gerar tipos novos.

## Objetivo
Manter o histórico de 30 dias em resolução fina, agregar o que envelhece em séries mensais
(base pra previsão de preço), e expor o endpoint de **demanda × oferta** que a calculadora vai
consumir na hora de decidir um craft.

## Por que

Pedido do usuário, textual:

> "O que eu quero manter é o histórico diário do mercado pra cada item pros últimos 30 dias,
> depois a gente pode juntar em uma tabela que seja preço de mês a mês (bom pra previsão futura
> de preço)."

> "Quando o usuário for craftar ou refinar alguma coisa, eu quero que ele tenha a visão de
> quantas pessoas estão comprando naquele momento aquele item. (...) É vital que a gente tenha
> esse histórico do dia, do agregado do dia, das últimas 24 horas, com o que está atualmente no
> mercado, a quantidade de itens que está pra vender ou pra comprar e o valor que está lá."

A medição mudou o custo disso pra melhor: `Timescale=2` entrega **28 dias a 6 h de resolução
num único scan** (ver [../../03-contrato-ingest-real.md](../../03-contrato-ingest-real.md)
seção 3) — mais granular do que "diário", e sem precisar acumular ao longo de semanas.

## O que implementar

### 1. Política de retenção
| Grão | Origem | Retenção | Por quê |
|---|---|---|---|
| 1 h (`bucket_seconds=3600`) | `Timescale=0` | **48 h** | só serve pra visão "últimas 24 h"; depois disso o de 6 h cobre o mesmo período |
| 6 h (`bucket_seconds=21600`) | `Timescale=1`/`2` | **90 dias** | cobre os 30 dias pedidos com folga |
| Diário | derivado | **2 anos** | série de médio prazo |
| Mensal | derivado | indefinido | base de previsão |

### 2. Tabelas derivadas
```python
class MarketHistoryDaily(Base):
    __tablename__ = "market_history_daily"
    # PK: (item_id, location_id, quality_level, dia)
    dia: Mapped[date]
    item_amount: Mapped[int] = mapped_column(BigInteger)
    silver_amount: Mapped[Decimal] = mapped_column(Numeric(20, 4))
    preco_medio: Mapped[Decimal] = mapped_column(Numeric(18, 4))   # silver/amount, ja normalizado

class MarketHistoryMonthly(Base):
    __tablename__ = "market_history_monthly"
    # PK: (item_id, location_id, quality_level, mes)  -- mes = primeiro dia do mes
    ...
```

`preco_medio` é **média ponderada por volume** (`sum(silver) / sum(amount)`), não média das
médias — média de médias distorce quando o volume varia entre buckets, que é o caso aqui.

### 3. Job periódico
`celery beat` (adicionar `beat_schedule` em `src/celery_app.py`) com três tarefas:
- `rollup_diario` — de hora em hora, recalcula os últimos 2 dias (idempotente, `ON CONFLICT DO
  UPDATE`), pra capturar buckets que chegaram atrasados.
- `rollup_mensal` — diário, recalcula o mês corrente e o anterior.
- `poda` — diário: apaga buckets fora da retenção, ordens com `expires < now()` e ordens com
  `last_seen_at` antigo (task 27).

> Recalcular uma janela em vez de processar só o incremento é deliberado: a coleta é
> desordenada por natureza (cada usuário traz uma janela diferente, a qualquer momento), então
> "processar o que chegou desde a última vez" perderia dado. Recalcular 2 dias é barato.

### 4. Endpoint de demanda
`GET /items/{item_id}/demand?location_id=...&quality=...`

```json
{
  "item": {"unique_name": "T2_FIBER", "nome": "Algodão"},
  "location_id": "1000-HellDen",
  "livro": {
    "venda":  {"preco": 37.0, "total_unidades": 1240, "qtd_ordens": 18},
    "compra": {"preco": 35.0, "total_unidades": 4756, "qtd_ordens": 12},
    "varredura_em": "2026-08-22T13:59:44Z"
  },
  "vendido": {
    "ultimas_24h": {"unidades": 33668, "preco_medio": 37.3},
    "ultimos_7d":  {"unidades": 210443, "preco_medio": 36.1},
    "ultimos_30d": {"unidades": 812004, "preco_medio": 41.2}
  },
  "serie_6h": [{"inicio": "...", "unidades": 4890, "preco_medio": 36.5}]
}
```

É esse objeto que responde "quantas pessoas estão comprando isso agora": `livro.compra` diz
quanta demanda está *parada esperando*, e `vendido.ultimas_24h` diz quanto de fato *girou*.

## Bibliotecas/dependências
`celery[beat]` (o Celery já está; confirmar se o beat precisa de extra no `pyproject.toml`).
Avaliar `celery-redbeat` se o agendamento precisar sobreviver a restart do beat.

> **Notas de implementação (2026-08-22):**
> - `celery beat` já vem no pacote `celery` (não é um extra) — nenhuma dependência nova.
> - Sem RedBeat: não instalado, e não há necessidade de múltiplas réplicas do beat neste
>   estágio. Usa o `PersistentScheduler` padrão (`celery -A src.celery_app beat`, processo
>   separado do worker).
> - `rollup_diario`/`rollup_mensal` foram implementados pra ler **exclusivamente os buckets
>   de 6h** (`bucket_seconds=21600`). Os de 1h (`bucket_seconds=3600`) nunca entram no
>   rollup — servem só pra alimentar `ultimas_24h` do endpoint de demanda em tempo real.
>   Motivo: os dois grãos cobrem o mesmo período real (a mesma transação, vista em
>   granularidades diferentes) — somar os dois duplicaria o giro contado. Essa leitura não
>   estava 100% explícita no texto original da spec, mas é a única consistente com o
>   teste automatizado dela ("4 buckets de 6h → 1 linha diária") e com o teste manual
>   (fixture real inteira em Timescale=2/6h).
> - `MarketHistoryDaily`/`MarketHistoryMonthly` usam PK surrogate (`uuid`) +
>   `UniqueConstraint`, não a PK composta do pseudocódigo — consistente com o resto de
>   `src/prices/models.py` (`MarketOrder`, `MarketHistoryEntry`, `MarketScan`).
> - "Ordens com `last_seen_at` antigo" (poda de `market_order`) não tinha um número definido
>   na spec — usei 7 dias como default (constante `MARKET_ORDER_STALE_AFTER` em
>   `src/prices/tasks.py`), não uma decisão de produto validada com o usuário.
> - `GET /items/{item_id}/demand` ganhou um query param extra não previsto no exemplo da
>   spec: `enchantment_level` (default `0`) — necessário porque `query_book_depth` precisa
>   dessa dimensão pra montar a combinação de profundidade do livro.

## Depende de
Tasks 26, 28 e 29.

## Testes manuais
1. Carregar a fixture real de histórico (113 buckets, 28 dias).
2. Rodar `rollup_diario` na mão → `SELECT * FROM market_history_daily` com ~28 linhas, e a soma
   de `item_amount` do dia batendo com a soma dos 4 buckets de 6 h daquele dia.
3. Rodar 2× → contagem estável, valores idênticos.
4. `GET /items/T2_FIBER/demand` → os dois lados do livro + os três agregados de vendido.

## Testes automatizados
- Rollup diário: 4 buckets de 6 h → 1 linha diária com soma correta e **média ponderada**
  (montar um caso onde a média simples daria resultado diferente — é o que pega o erro).
- Idempotência do rollup em 2 execuções.
- Poda: bucket de 1 h com 3 dias de idade é removido; o de 6 h do mesmo período permanece.
- Endpoint de demanda com livro vazio → campos zerados, não erro nem `null` solto.
