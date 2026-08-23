# 25 — Normalização de escala e tempo na borda do ingest

> Corrige **N1**, **N4**, **M2** e **M3** de [../../04-revisao-fase-1.md](../../04-revisao-fase-1.md).
> Base empírica em [../../03-contrato-ingest-real.md](../../03-contrato-ingest-real.md) seções 1, 2 e 5.

## Objetivo
Converter, **uma única vez na borda do ingest**, as três grandezas que o jogo manda em formato
próprio: prata ×10.000, timestamp em tick do .NET e `Expires` como texto ISO de precisão
variável. E migrar todas as colunas de tempo pra `TIMESTAMPTZ`.

## Por que
Medido no jogo real: **todo campo de prata no fio é o valor real × 10⁴** (167/167 valores do
histórico são múltiplos exatos de 10000; `UnitPriceSilver: 370000` = 37 silver de algodão T2).
O backend grava esse número cru, como `BigInteger`, sem uma linha de documentação — **qualquer
conta de lucro sai errada por 4 ordens de grandeza**. Esse é o tipo de bug que não aparece em
teste (o dict inventado tinha `unit_price_silver: 100`, que "parece" um preço) e só quebra
quando alguém confia no número.

Os timestamps são **tick de 100 ns desde 0001-01-01**, não epoch Unix. Guardar `BigInteger` cru
inviabiliza qualquer agrupamento por dia/hora em SQL — que é exatamente a base do histórico de
30 dias e do rollup mensal (task 31).

`Expires` chega como ISO sem timezone e com precisão variável (medimos 24, 25 e 26 caracteres —
o Go corta zeros à direita). Guardado como `String(32)`, não dá pra filtrar ordem expirada em
SQL, que é o freio de segurança da profundidade do livro (task 29).

E `M2`: todas as colunas de tempo hoje são `TIMESTAMP WITHOUT TIME ZONE`, o que já obrigou uma
gambiarra (`datetime.now(timezone.utc).replace(tzinfo=None)` em `src/api_tokens/service.py:52`).
Com as tabelas ainda pequenas, é barato consertar agora.

## O que implementar

### 1. `src/ingest/normalize.py` (novo)
Um módulo único com as conversões, sem dependência de banco — fácil de testar isolado:

```python
SILVER_SCALE = 10_000          # ver docs/03-contrato-ingest-real.md secao 1
TICKS_UNIX_EPOCH = 621_355_968_000_000_000   # mesma constante usada pelo client Go
TICKS_PER_SECOND = 10_000_000

def silver_from_wire(valor: int) -> Decimal: ...
def datetime_from_ticks(tick: int) -> datetime: ...   # devolve aware, UTC
def datetime_from_expires(texto: str) -> datetime: ...  # aceita 0 a 6 casas decimais
```

Usar `Decimal` (não `float`) pra prata — é dinheiro, e a divisão por 10⁴ é exata.

### 2. Colunas
| Tabela | Coluna | De | Para |
|---|---|---|---|
| `market_order` | `unit_price_silver` | `BigInteger` (cru) | `Numeric(18,4)` em silver real |
| `market_order` | `expires` | `String(32)` | `DateTime(timezone=True)` |
| `market_order` | `collected_at` | `DateTime()` | `DateTime(timezone=True)` |
| `market_history_entry` | `silver_amount` | `BigInteger` (cru) | `Numeric(20,4)` em silver real |
| `market_history_entry` | `timestamp` | `BigInteger` (tick) | `bucket_start` `DateTime(timezone=True)` (ver task 26) |
| `api_token` | `created_at`, `revoked_at` | `DateTime()` | `DateTime(timezone=True)` |

> **Decisão:** converter na borda e guardar já normalizado, em vez de guardar cru e converter na
> leitura. Motivo: o valor cru não tem utilidade nenhuma pra nós, e guardar cru significa que
> toda query, todo relatório e todo consumidor futuro precisa lembrar de dividir. A fidelidade
> ao fio fica garantida pelas fixtures em `tests/fixtures/wire/`, não pelo schema.

Depois disso, remover o `.replace(tzinfo=None)` de `src/api_tokens/service.py:52` e o comentário
que o explicava.

### 3. Migration
As tabelas de mercado ainda não têm dado de produção — a migration pode recriar/converter
direto. Se houver dado local que valha manter, converter com `USING`:
`ALTER TABLE market_order ALTER COLUMN unit_price_silver TYPE numeric(18,4) USING unit_price_silver / 10000.0`.

## Bibliotecas/dependências
Nenhuma nova.

## Depende de
Task 23. As tasks 26, 27 e 29 dependem desta.

## Testes manuais
1. Enviar `tests/fixtures/wire/marketorders-real-t2fiber.json` pro ingest.
2. `SELECT unit_price_silver, expires FROM market_order LIMIT 5` → preços na casa de **37,0000**
   (não 370000) e `expires` como timestamp com timezone, ~30 dias no futuro.
3. Enviar `markethistories-real-t2fiber-ts2.json` → `SELECT bucket_start FROM
   market_history_entry ORDER BY bucket_start DESC LIMIT 3` deve mostrar datas de 2026-08-22
   pra trás, de 6 em 6 horas.

## Testes automatizados
- `tests/ingest/test_normalize.py`, sem banco:
  - `silver_from_wire(370000) == Decimal("37")`
  - `datetime_from_ticks(639229968000000000)` cai em 2026-08-22 (valor real da captura)
  - `datetime_from_expires` aceita as três precisões medidas: `"2026-09-21T06:39:47.636097"`,
    `"2026-09-21T06:39:47.6360"`, `"2026-09-21T06:39:47"`
- Teste de contrato lendo a fixture real e afirmando que **todos** os `SilverAmount` são
  múltiplos de 10000 — se um dia deixar de ser, essa premissa quebrou e queremos saber.
