# 29 — Preços por lado do livro e profundidade de mercado

> Corrige **C3**, **C4**, **C5** e **M1** de [../../04-revisao-fase-1.md](../../04-revisao-fase-1.md).
> Base empírica em [../../03-contrato-ingest-real.md](../../03-contrato-ingest-real.md) seção 5.

## Objetivo
Refazer cache e leitura de preços em torno da pergunta que a calculadora realmente faz:
**quanto está sendo vendido e comprado deste item agora, a que preço, e quanto girou nas
últimas 24 h.**

## Por que

### O bug mais destrutivo do backend hoje
A chave de cache `price:{item}:{cidade}:{qualidade}` (`src/cache/redis_client.py:19`) ignora
`auction_type`. Medido no algodão T2:

| Lado | Faixa real (silver) |
|---|---|
| `offer` (venda) | 37,0 – 39,0 |
| `request` (compra) | **1,0** – 35,0 |

São universos separados — e quem grava no cache é a **primeira ordem do lote**
(`src/ingest/tasks.py:47`, apesar do comentário dizer "melhor preço"). O preço cacheado do
algodão pode virar **1 silver**, e a calculadora diria que craftar com algodão é lucro
infinito. `tests/ingest/test_tasks.py:75` chega a *afirmar* o comportamento de "primeiro vence".

Pior: `auction_type` **não dá pra inferir pelo endpoint** — a resposta de `opAuctionGetOffers`
trouxe ordens `"AuctionType":"request"` misturadas. O campo da própria ordem é a única fonte.

### `scope=mine` furado
`src/prices/service.py:14` lê o cache **antes** de aplicar o filtro de escopo, então com cache
quente `scope=mine` devolve dado de outro usuário. O teste que "prova" isolamento só passa
porque usa item aleatório e cache frio.

### 80 round-trips por request
O loop de 8 cidades × 5 qualidades faz 40 `GET` no Redis + até 40 queries sequenciais no
Postgres — no endpoint que a spec 18 define como o mais chamado do sistema.

## O que implementar

### 1. Novo formato de cache: profundidade, não preço solto
Uma chave por (item, local, qualidade, encantamento), guardando os dois lados:

```
livro:{item_id}:{location_id}:{quality}:{ench}
{
  "venda":  {"menor_preco": 37.0, "total_unidades": 1240, "qtd_ordens": 18},
  "compra": {"maior_preco": 35.0, "total_unidades": 4756, "qtd_ordens": 12},
  "vendido_24h": {"unidades": 33668, "preco_medio": 37.3},
  "atualizado_em": "2026-08-22T13:59:51Z",
  "varredura_em": "2026-08-22T13:59:44Z"
}
```

`varredura_em` (o `last_seen_at` mais recente do livro) é o que permite a UI avisar "esse dado
tem 3 dias".

### 2. Profundidade calculada do Postgres, não do lote
Um lote só tem o que **aquele jogador enxergou na tela** — somar o lote subestima. Depois de
gravar as ordens (task 27), a task recalcula a profundidade das combinações tocadas com **uma**
query agregada, e só então grava no cache:

```sql
SELECT item_id, location_id, quality_level, enchantment_level, auction_type,
       min(unit_price_silver) FILTER (WHERE auction_type = 'offer')   AS menor_venda,
       max(unit_price_silver) FILTER (WHERE auction_type = 'request') AS maior_compra,
       sum(amount), count(*)
  FROM market_order
 WHERE (item_id, location_id, quality_level) IN (...)   -- combinacoes do lote
   AND expires > now()
   AND last_seen_at > now() - :janela_frescor
 GROUP BY 1,2,3,4,5
```

**Janela de frescor**: default proposto **6 horas**, configurável em `Settings`. Sem ela, ordem
vendida há semanas continua contando como oferta viva (ver task 27).

### 3. Leitura em lote, não em loop
`get_item_prices` passa a fazer:
1. Um `MGET` único com todas as chaves candidatas.
2. Para as que faltarem, **uma** query com `DISTINCT ON (location_id, quality_level,
   auction_type)` cobrindo tudo de uma vez.

As localizações vêm da tabela `location` (task 28), não de lista hardcoded.

### 4. `scope` antes do cache
Duas opções, escolher na implementação:
- **(preferida)** `scope=mine` não usa cache — vai direto ao Postgres com o join de cobertura
  (task 30). É o caminho menos chamado; simplicidade vale mais que latência aqui.
- Namespace de cache por escopo (`livro:mine:{user_id}:...`) — só se medirmos que `mine` é
  quente o suficiente pra justificar.

### 5. Schema de resposta
`CityPrice` é substituído por algo que carregue os dois lados e o giro:

```python
class LadoDoLivro(BaseModel):
    preco: Decimal | None
    total_unidades: int
    qtd_ordens: int

class PrecoPorLocal(BaseModel):
    location_id: str
    quality_level: int
    enchantment_level: int
    venda: LadoDoLivro
    compra: LadoDoLivro
    vendido_24h: VolumeVendido | None
    varredura_em: datetime | None
```

`collected_at: str | None` sai — vira `datetime` de verdade (task 25).

## Bibliotecas/dependências
Nenhuma nova.

## Depende de
Tasks 25, 26, 27 e 28.

## Testes manuais
1. Enviar as fixtures reais, `GET /items/T2_FIBER/prices`.
2. Conferir que `venda.preco` cai na faixa 37–39 e `compra.preco` em ~35 — **nunca** 1,0 no
   campo de venda.
3. `redis-cli KEYS 'livro:*'` → chaves separadas, com os dois lados no mesmo objeto.
4. Envelhecer o dado (`UPDATE market_order SET last_seen_at = now() - interval '2 days'`) →
   profundidade zera e `varredura_em` reflete a idade.

## Testes automatizados
- **Teste do C3**: gravar `offer` a 39 e `request` a 1 pro mesmo item/cidade/qualidade →
  afirmar `venda.preco == 39` e `compra.preco == 1`, cada um no seu campo. É o teste que prova
  o bug corrigido.
- **Teste do C4**: lote com várias `offer` → `venda.preco` é o **menor**, não o primeiro do lote.
- **Teste do C5**: gravar ordem do usuário A, aquecer o cache, consultar como usuário B com
  `scope=mine` → resposta vazia (hoje esse teste falharia).
- **Teste do M1**: contar queries emitidas numa chamada (via `event.listen` no engine) e
  afirmar que não cresce com o número de cidades.
- Ordem expirada e ordem fora da janela de frescor não entram na profundidade.
