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

## Estado da implementação

**Concluída** (2026-09-22). `uv run pytest tests/` — **489 passed, 1 skipped** (era 487).
`uv run ruff check .` e `ruff format --check .` limpos.

- **`backend/src/items/models.py`** — `Item.__table_args__` (índice novo no módulo; o modelo
  não tinha nenhum) com `Index("ix_item_busca_normalizada_trgm", "busca_normalizada",
  postgresql_using="gin", postgresql_ops={"busca_normalizada": "gin_trgm_ops"})`, batendo
  exatamente com `alembic/versions/f1c6d7e8f9a0_...py`.
- **`backend/tests/test_migrations_match_models.py`** (novo) — sobe uma engine contra o banco
  já migrado a `head` (mesmo DSN que `conftest.py` usa) e roda
  `alembic.autogenerate.compare_metadata` contra `Base.metadata`, com todos os módulos de
  modelo importados (mesma lista que `alembic/env.py` usa, pelo mesmo motivo: autogenerate só
  enxerga o que foi importado). Fecha a categoria inteira (item 3), não só este índice — calquer
  outro drift entre metadata e banco apareceria aqui.
- **`backend/tests/items/test_search_trigram_index.py`** (novo) — prova que o índice é **usado**
  de verdade pela consulta de busca (`EXPLAIN`, sem `enable_seqscan = off`), não só que ele
  existe. Precisou de 500 mil linhas sintéticas geradas server-side (`generate_series`) — ver
  desvio abaixo.
- **`CLAUDE.md`/`AGENTS.md`** — linha de DB/ORM agora registra `pg_trgm` como extensão em uso
  (não só `pgvector`, que segue "disponível, não usado"), apontando pra
  `docs/06-fontes-de-dados-estaticos.md`, que já tinha a nota operacional completa sobre
  permissão de `CREATE EXTENSION` em produção (item 2 — já estava documentado ali, só não no
  nível arquitetural do `CLAUDE.md`).

### Decisão sobre o item 4 (CI)

**Não criei um step novo no `migrations-and-image`.** `test_migrations_match_models.py` já
roda dentro de `uv run pytest tests/` no job `quality` do `backend-ci.yml`, que já é executado
contra Postgres real (`services: postgres` do próprio job). Um segundo mecanismo fazendo
`alembic revision --autogenerate` de verdade no job `migrations-and-image` verificaria a mesma
coisa por outro caminho — checar duas vezes a mesma invariante não fecha uma porta a mais, só
duplica manutenção. A "porta fechada" que o item 4 pede já está fechada pelo teste novo.

### Desvios da spec

- **A tabela de teste (item da spec "EXPLAIN... sem varredura sequencial") precisou de 500 mil
  linhas, não só "dados de teste".** Tentativas com volume comparável a produção (12 mil,
  depois 120 mil linhas com texto curto/aleatório) continuaram perdendo pra seq scan — o custo
  por linha de um filtro `LIKE` num seq scan é baixo demais numa tabela estreita para o
  planner do Postgres preferir um bitmap index scan abaixo de um certo volume. Gerar as linhas
  em Python (`executemany`) nesse volume também se provou impraticavelmente lento (>180 s);
  reescrevi para gerar tudo server-side com `generate_series`, que roda em segundos.
- **Item 2 já estava parcialmente feito.** `docs/06-fontes-de-dados-estaticos.md:105-107` já
  documentava a permissão de `CREATE EXTENSION pg_trgm` em produção antes desta task — só
  adicionei a referência no nível arquitetural (`CLAUDE.md`/`AGENTS.md`), que não mencionava
  `pg_trgm` nenhuma vez.
