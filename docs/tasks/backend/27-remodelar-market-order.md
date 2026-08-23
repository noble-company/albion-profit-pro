# 27 — Remodelar `market_order`: estado atual do livro

> Corrige **C2** de [../../04-revisao-fase-1.md](../../04-revisao-fase-1.md).
> Base empírica em [../../03-contrato-ingest-real.md](../../03-contrato-ingest-real.md) seção 5.

## Objetivo
Transformar `market_order` de log de varreduras em **estado atual do livro de ofertas**: uma
linha por leilão do jogo, deduplicada pelo `Id`, com frescor rastreado.

## Por que
`src/ingest/tasks.py:44` é `INSERT` puro e a tabela não tem constraint única. A spec 17 dizia
"upsert em lote", mas só o histórico ganhou `ON CONFLICT`.

**Medido no jogo real:** uma visita ao mercado de ~10 segundos gerou 4 payloads — 194 linhas
para **97 ordens reais, exatamente 2,0×**. Os lotes #1/#4 e #2/#3 trazem `Id`s idênticos. Como
o client reenvia o livro inteiro toda vez que o jogador abre o mercado, a tabela cresce sem
limite com cópias da mesma oferta parada, e a leitura fica mais lenta a cada varredura.

O `Id` do payload é o id do leilão no jogo e é **estável entre varreduras** — é a chave natural.

### Por que estado atual, e não série temporal
A calculadora precisa de "qual o melhor preço agora" e "quanta unidade está no livro agora". A
série temporal de preços **já vem pronta e melhor** pelo `markethistories.ingest` (task 26),
que traz preço **realmente transacionado**, não "o que alguém estava pedindo". Guardar snapshot
do livro a cada varredura seria uma série ruim (amostragem irregular, enviesada pelo horário em
que alguém abriu o mercado) e cara.

### O problema que isso cria: ordem fantasma
Se a tabela vira estado atual, uma ordem vendida ou expirada **fica lá para sempre** — o jogo
não manda evento de "sumiu", a gente só para de ver. Sem freio, "10.000 unidades à venda" pode
ser fantasma de semanas atrás. Dois freios, os dois necessários:

1. `expires > now()` — já disponível como timestamp de verdade depois da task 25.
2. **Janela de frescor**: só conta ordem vista numa varredura recente (`last_seen_at`).
   **Default proposto: 6 horas** — decisão de produto, confirmar com o usuário antes de fixar.

## O que implementar

### Modelo
```python
class MarketOrder(Base):
    __tablename__ = "market_order"
    __table_args__ = (
        UniqueConstraint("source_id", name="uq_market_order_source"),
        Index("ix_market_order_book",
              "item_id", "location_id", "quality_level", "auction_type"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    source_id: Mapped[int] = mapped_column(BigInteger)   # campo "Id" -- id do leilao no jogo

    item_id: Mapped[str] = mapped_column(String(64), index=True)     # ItemTypeId (string!)
    group_type_id: Mapped[str] = mapped_column(String(64))
    location_id: Mapped[str] = mapped_column(String(64), index=True)  # ver task 28
    quality_level: Mapped[int]
    enchantment_level: Mapped[int]
    auction_type: Mapped[str] = mapped_column(String(16))   # "offer" = venda, "request" = compra

    unit_price_silver: Mapped[Decimal] = mapped_column(Numeric(18, 4))  # silver real, task 25
    amount: Mapped[int]
    expires: Mapped[datetime] = mapped_column(DateTime(timezone=True))  # task 25

    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
```

Sai: `user_id` e `is_public` (procedência vai pra tabela de cobertura, task 30);
`collected_at` vira `first_seen_at`/`last_seen_at`.

> **`source_id` é globalmente único?** O comentário do modelo original desconfiava que não
> ("não é globalmente único entre servidores"). Hoje o backend não guarda de qual servidor
> (west/east/europe) o dado veio, e o payload não carrega isso. Enquanto atendermos um servidor
> só, `source_id` basta. **Quando suportarmos múltiplos servidores, a chave precisa virar
> `(server_id, source_id)`** — registrar como pendência na task da Fase 2 que adicionar o
> conceito de servidor.

### Upsert
```python
stmt = pg_insert(MarketOrder).values(rows)
stmt = stmt.on_conflict_do_update(
    constraint="uq_market_order_source",
    set_={
        "unit_price_silver": stmt.excluded.unit_price_silver,
        "amount": stmt.excluded.amount,
        "expires": stmt.excluded.expires,
        "last_seen_at": func.now(),
    },
)
```
Deduplicar as `rows` por `source_id` em Python antes (mesmo motivo da task 26: o Postgres recusa
a mesma chave duas vezes no mesmo `INSERT`).

### Limpeza
Um job periódico (mesma leva da task 31) apaga ordens com `expires < now()` ou
`last_seen_at < now() - interval '30 days'`.

## Bibliotecas/dependências
Nenhuma nova.

## Depende de
Tasks 23 e 25. A task 29 depende desta.

## Testes manuais
1. Enviar `tests/fixtures/wire/marketorders-real-t2fiber.json` → 50 linhas.
2. Enviar **o mesmo arquivo de novo** → continua 50 linhas, `last_seen_at` atualizado.
   (Antes da correção: 100 linhas.)
3. `SELECT count(*), count(DISTINCT source_id) FROM market_order` → os dois números iguais.

## Testes automatizados
- **Teste do 2,0×**: enviar os 4 payloads reais da captura em sequência e afirmar
  `count(*) == 97` (o número de `Id`s distintos medido), não 194. É o teste que prova o C2
  corrigido.
- Upsert atualiza preço/quantidade: mesma `source_id` com preço diferente → 1 linha, preço novo.
- Ordem expirada não entra na leitura do livro (cobre junto com a task 29).
