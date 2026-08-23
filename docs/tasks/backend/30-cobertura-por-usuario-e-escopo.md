# 30 — Cobertura por usuário e `scope=all|mine`

> Corrige **M5** e a metade de **C5** que sobrou da task 29. Implementa a **decisão de produto
> nº 1** de [../../04-revisao-fase-1.md](../../04-revisao-fase-1.md).

## Objetivo
Manter os dados de mercado **globais e deduplicados**, e resolver "só o que eu coletei" por uma
tabela de **procedência**, não duplicando as linhas de fato por usuário.

## Por que

Decisão do usuário (2026-08-22), textual:

> "Quero que tenhamos 2 opções pro usuário: ele usar os dados globais (captados por todos os
> players) ou só o captado por ele. Mas de qualquer forma, o que for captado por ele vai ir pro
> global junto com o que todo mundo coletar."

Isso define o desenho: **todo dado é público e global**; `mine` é um recorte de procedência.

O modelo atual faz o oposto — carrega `user_id` em cada linha de fato e põe na constraint única
do histórico (M7). Como o histórico é autoritativo do servidor do jogo, isso multiplica linhas
byte-a-byte idênticas por usuário. E `is_public` (M5) é coluna morta: existe nas duas tabelas e
nas migrations, e **nenhuma query lê ou escreve**. Com a decisão acima, ela deixa de ter
sentido — todo dado é público por definição.

### Por que uma tabela de cobertura, e não `user_id` na linha
Um usuário não contribui pontos individuais — ele contribui **varreduras**. Guardar
procedência no grão de (usuário × item × cidade × qualidade) dá uma tabela pequena, limitada
pelo que a pessoa de fato olhou. Guardar no grão do fato (cada ordem, cada bucket) multiplica a
tabela inteira por N usuários pra responder uma pergunta de baixa frequência.

## O que implementar

### `market_scan`
```python
class MarketScan(Base):
    __tablename__ = "market_scan"
    __table_args__ = (
        UniqueConstraint("user_id", "item_key", "location_id", "quality_level", "fonte",
                         name="uq_market_scan"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id"), index=True)

    # unique_name do item (task 28) -- o ingest de historico resolve AlbionId -> unique_name
    # antes de gravar aqui, pra cobertura ficar num identificador so.
    item_key: Mapped[str] = mapped_column(String(64), index=True)
    location_id: Mapped[str] = mapped_column(String(64))
    quality_level: Mapped[int]
    fonte: Mapped[str] = mapped_column(String(16))     # "livro" | "historico"

    primeira_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    ultima_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    n_varreduras: Mapped[int] = mapped_column(default=1)
```

Upsert a cada ingest: `ON CONFLICT DO UPDATE SET ultima_em = now(), n_varreduras = n_varreduras + 1`.

### Remover `user_id` e `is_public` dos fatos
Sai de `market_order` (task 27) e `market_history_entry` (task 26). A migration deve rodar
**depois** de popular `market_scan` a partir do que já existe, se houver dado local que valha
preservar.

> **Nota de implementação (2026-08-22):** quando esta task foi implementada, as migrations
> das tasks 26/27 (`80ba87175991`, `2a61cb833442`) já tinham removido `user_id`/`is_public`
> de ambas as tabelas-fato, sem popular nenhuma tabela de cobertura antes — esse dado de
> procedência já não existia mais no banco. A migration desta task (`e09bad535abd`) só cria
> `market_scan`; não há passo de backfill.

### `scope=mine`
Vira um `EXISTS` contra `market_scan`:

```sql
... AND EXISTS (
      SELECT 1 FROM market_scan s
       WHERE s.user_id = :user_id
         AND s.item_key = :item_key
         AND s.location_id = mo.location_id
         AND s.quality_level = mo.quality_level
    )
```

Semanticamente: `mine` = "os locais/qualidades que **eu** varri", com os valores globais (que
são os mesmos que eu veria). Não é um conjunto de dados separado — é um filtro de cobertura.
**Documentar isso na resposta da API**, porque não é óbvio: dois usuários com `scope=mine` no
mesmo item/cidade veem o mesmo preço, e isso está correto.

## Bibliotecas/dependências
Nenhuma nova.

## Depende de
Tasks 26, 27, 28 e 29.

## Testes manuais
1. Usuário A envia ingest de T2_FIBER em `1000-HellDen`; usuário B envia de outro item.
2. `GET /items/T2_FIBER/prices?scope=mine` como A → traz dado. Como B → vazio.
3. Como B, `scope=all` → traz o dado de A (prova que a contribuição de A foi pro acervo comum).
4. `SELECT * FROM market_scan` → 1 linha por usuário/combinação, `n_varreduras` subindo a cada
   novo envio, não uma linha por ordem.

## Testes automatizados
- Cobertura: 2 ingests do mesmo usuário/combinação → 1 linha em `market_scan`,
  `n_varreduras == 2`.
- `scope=mine` com **cache quente** de outro usuário → vazio (o furo do C5 que a task 29 não
  cobre sozinha).
- `scope=all` devolve dado de qualquer coletor.
- Afirmar que `market_order`/`market_history_entry` não têm mais coluna `user_id` nem
  `is_public` (teste de schema, pega regressão de migration).
