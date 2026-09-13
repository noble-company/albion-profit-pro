# 09 — Índice trigram no modelo

> Corrige `E08`.

## Objetivo

Alinhar `Base.metadata` ao schema real, para que o próximo `--autogenerate` não proponha dropar
o índice que sustenta a busca de itens.

## Por que

A migração `backend/alembic/versions/f1c6d7e8f9a0_adicionar_busca_normalizada_de_itens.py` cria a
extensão e o índice:

```python
op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")          # :22
op.create_index(
    "ix_item_busca_normalizada_trgm",                          # :59
    ...
    postgresql_using="gin",
    postgresql_ops={"busca_normalizada": "gin_trgm_ops"},      # :63
)
```

Mas `backend/src/items/models.py` é o **único** módulo de modelos sem `__table_args__`, e a
coluna é declarada sem índice:

```python
busca_normalizada: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("''"))  # :30
```

`alembic/env.py` usa `Base.metadata` como `target_metadata`. Autogenerate compara metadata contra
banco: como o índice existe no banco e não na metadata, a próxima revisão gerada vai conter
`op.drop_index("ix_item_busca_normalizada_trgm")`. Se isso passar despercebido numa revisão de
rotina, a busca de itens cai para varredura sequencial em três caminhos quentes:

- `src/items/service.py:71` — `GET /items/search`
- `src/opportunities/service.py:26` — filtro por item no flip
- `src/opportunities/ranking_service.py:442` — filtro por item no ranking

Todos usam `Item.busca_normalizada.contains(..., autoescape=True)`, que vira `LIKE '%…%'` — sem
índice trigram, é seq scan sobre ~12 mil itens por request.

Conferi os demais índices (`ix_market_order_book`, `ix_market_order_latest_observation`,
`ix_market_history_lookup`, `ix_quarantined_task_status_failed_at`, `ix_recipe_ranking_*`,
`ix_recipe_production_kind`): todos estão nos dois lados. Este é o único drift.

## O que implementar

1. Declarar o índice em `__table_args__` de `Item`, com `postgresql_using="gin"` e
   `postgresql_ops={"busca_normalizada": "gin_trgm_ops"}`, batendo exatamente com a migração.
2. Confirmar que a extensão `pg_trgm` é pré-requisito conhecido do ambiente — ela é criada por
   migração, mas a metadata não a expressa. Registrar isso onde as dependências de banco estão
   documentadas.
3. Fechar a categoria inteira, não só o caso: rodar `--autogenerate` sobre banco migrado e
   confirmar **diff vazio**, o que prova que não há outro drift escondido.
4. Avaliar transformar essa conferência em passo de CI. O `backend-ci.yml` já tem um job
   `migrations-and-image` com Postgres de serviço; acrescentar um step que gera revisão e falha
   se o arquivo não vier vazio fecha a porta de vez.

## Depende de

Nada.

## Testes automatizados

- Teste que sobe o schema por `alembic upgrade head`, roda a comparação de metadata e afirma que
  não há diferença. Deve **falhar** antes da correção, acusando o `drop_index`.
- A busca de itens continua devolvendo os mesmos resultados.
- `EXPLAIN` da consulta de busca usa o índice, sem varredura sequencial.

## Testes manuais

Nenhum — é verificável inteiramente por automação.
