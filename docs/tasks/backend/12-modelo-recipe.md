# 12 — Modelo Recipe/RecipeIngredient (Fase 1b)

## Objetivo
Tabelas `recipe` e `recipe_ingredient` pra guardar os dados de craft/refino extraídos do `ITEM DUMP.json` (ver [docs/02-dados-de-receita.md](../../02-dados-de-receita.md)) — necessárias pro cálculo de lucro da calculadora (custo dos ingredientes × preço de mercado).

## Por que
Sem essa tabela, a calculadora não sabe "craftar 1 T2_CLOTH exige 1 T2_FIBER" — é dado estático (não muda com o mercado), populado uma vez pelo script de import (task 19), não pelo fluxo de ingest do client.

## O que implementar
`src/recipes/models.py`:
```python
import uuid
from sqlalchemy import BigInteger, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.database import Base


class Recipe(Base):
    """Uma receita = como craftar/refinar UM item (o output)."""
    __tablename__ = "recipe"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)

    # Chave de junção dupla — ver docs/02-dados-de-receita.md ("Chave de junção com items.json"):
    output_item_unique_name: Mapped[str] = mapped_column(String(64), unique=True, index=True)  # @uniquename
    output_item_id: Mapped[int | None] = mapped_column(BigInteger, index=True, nullable=True)   # Index resolvido via items.json

    silver_cost: Mapped[int] = mapped_column(default=0)       # @silver
    crafting_focus: Mapped[int] = mapped_column(default=0)    # @craftingfocus
    amount_crafted: Mapped[int] = mapped_column(default=1)    # @amountcrafted
    craft_time: Mapped[float] = mapped_column(Numeric(10, 5), default=0)  # @time (unidade não confirmada, ver docs/02)

    ingredients: Mapped[list["RecipeIngredient"]] = relationship(back_populates="recipe", cascade="all, delete-orphan")


class RecipeIngredient(Base):
    __tablename__ = "recipe_ingredient"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    recipe_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("recipe.id"), index=True)

    ingredient_unique_name: Mapped[str] = mapped_column(String(64), index=True)  # @uniquename do craftresource
    ingredient_item_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)  # Index resolvido via items.json
    count: Mapped[int]                    # @count
    enchantment_level: Mapped[int] = mapped_column(default=0)  # @enchantmentlevel

    recipe: Mapped["Recipe"] = relationship(back_populates="ingredients")
```

Notas:
- `output_item_id`/`ingredient_item_id` são **nullable** porque, no import inicial (task 19), pode haver itens em `ITEM DUMP.json` sem correspondente em `items.json` (nomes descontinuados/beta) — o script de import resolve o que der e loga o que não achar, sem falhar o import inteiro.
- `RecipeIngredient` separado de `Recipe` (em vez de um JSON column) porque queremos poder consultar "quais receitas usam X matéria-prima" depois (útil pra outras features futuras, tipo "onde uso esse item").

### Revisão 2026-08-21 — encantamento (`enchantments`/`upgraderequirements`)

Modelado o que a nota original desta task deixou como "próxima iteração": `Recipe` ganhou 4 colunas novas (migration `42c9111202e7_add_enchantment_fields_to_recipe.py`):

```python
enchantment_level: Mapped[int] = mapped_column(default=0, index=True)  # 0 = base

upgrade_resource_unique_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
upgrade_resource_item_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
upgrade_resource_count: Mapped[int | None] = mapped_column(nullable=True)
```

- Cada nível de encantamento (0-4) vira sua própria linha em `recipe`, com `output_item_unique_name = "{base}@{nivel}"` pra `nivel > 0` (convenção que já existe em `items.json`, não inventada aqui — ver [docs/02-dados-de-receita.md](../../02-dados-de-receita.md)).
- `upgrade_resource_*` guarda o custo de **upgradar** um item já craftado no nível anterior (runas/almas/relíquias) — rota alternativa a craftar já encantado do zero. Sempre `NULL` pra `enchantment_level=0`.
- **Cuidado de migração**: a tabela `recipe` já tinha 2289 linhas (populada pela task 19) quando essa revisão foi feita — `ADD COLUMN enchantment_level NOT NULL` sem `server_default` quebra nesse cenário (`column contains null values`). A migration usa `server_default='0'` no `add_column` e remove o default logo em seguida (`alter_column(..., server_default=None)`) — as linhas existentes recebem `0` na migração, e o `default=0` do lado do SQLAlchemy cobre os INSERTs futuros.

## Bibliotecas/dependências
Nenhuma nova.

## Depende de
Task 06 (Alembic). Não depende de `User`/`market_order` — é uma tabela independente.

## Testes manuais
1. `uv run alembic revision --autogenerate -m "add recipe tables"` → gerar e revisar.
2. `uv run alembic upgrade head`.
3. Inserir manualmente a receita de exemplo do T2_CLOTH (`docs/02-dados-de-receita.md`) e consultar via `relationship` (`recipe.ingredients`) — confirma que o relacionamento carrega certo.

## Testes automatizados
- `tests/recipes/test_recipe_model.py`: cria uma `Recipe` com 2 `RecipeIngredient` (ex: replicando o exemplo do T3_CLOTH — 2 ingredientes), confirma que o `cascade="all, delete-orphan"` funciona (deletar a recipe remove os ingredientes).

## Notas de implementação (2026-08-21)
Única surpresa: `cascade="all, delete-orphan"` só funciona com `session.delete(obj)` (estilo ORM) — um `DELETE` em massa via `session.execute(delete(Recipe).where(...))` (estilo Core) não aciona o cascade, porque não passa pelo unit-of-work do SQLAlchemy. Meu primeiro teste usava a versão Core na limpeza e quebrou com `ForeignKeyViolationError` (ainda tinha `RecipeIngredient` referenciando a receita). Corrigido pra `session.delete(loaded)`. Fora isso, sem surpresas — tabelas e índices bateram exatamente com o esperado de primeira, e nenhum fix de import do Alembic foi necessário (tabela `recipe`/`recipe_ingredient` não tem FK pra `user.id`).
