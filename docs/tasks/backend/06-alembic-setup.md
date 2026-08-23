# 06 — Alembic (migrations)

## Objetivo
Configurar Alembic em modo assíncrono, apontando pra `Base.metadata` do SQLAlchemy, com o harness pronto pra gerar migrations conforme os modelos forem sendo criados nas próximas tasks.

## Por que
Alembic é o padrão de fato pra migrations com SQLAlchemy — confirmado compatível com Python 3.13/3.14. Configurar isso agora (antes dos modelos existirem) significa que cada task de modelo (07 em diante) só precisa rodar `alembic revision --autogenerate` e revisar, sem reconfigurar nada.

## O que implementar
1. `uv add --dev alembic`
2. `uv run alembic init -t async alembic` (o template `async` já vem com o `env.py` preparado pra engine assíncrona — evita escrever isso à mão)
3. Editar `alembic/env.py` gerado pra importar nossa `Base` e ler a URL do banco da nossa própria configuração (não do `alembic.ini` estático), garantindo consistência com `src/config.py`:
   ```python
   # dentro de env.py, ajustar:
   from src.config import get_settings
   from src.database import Base

   # importar todos os módulos de modelos aqui, senão o autogenerate não os enxerga:
   from src.auth import models as auth_models  # noqa: F401
   from src.api_tokens import models as api_token_models  # noqa: F401
   from src.prices import models as prices_models  # noqa: F401
   from src.recipes import models as recipes_models  # noqa: F401

   target_metadata = Base.metadata

   config.set_main_option("sqlalchemy.url", get_settings().database_url)
   ```
   (os imports de modelos que ainda não existem são adicionados incrementalmente conforme as tasks 07/10/11/12 forem implementadas — nesta task, `target_metadata` pode ficar vazio/só com o que já existir).
4. Gerar a migration inicial (vazia, só pra confirmar que o harness funciona):
   ```bash
   uv run alembic revision --autogenerate -m "baseline vazio"
   uv run alembic upgrade head
   ```

## Bibliotecas/dependências
- `uv add --dev alembic`

## Depende de
Task 05 (conexão com banco — Alembic usa a mesma `Base`/engine).

## Testes manuais
1. `uv run alembic upgrade head` → aplica sem erro contra o Postgres local (task 04).
2. `uv run alembic current` → mostra a revision aplicada.
3. `uv run alembic downgrade -1` seguido de `upgrade head` → confirma que downgrade/upgrade funcionam simetricamente (importante pra rollback seguro em produção depois).

## Testes automatizados
- Não se testa Alembic isoladamente com pytest — a validação real acontece nas tasks de modelo (07+), onde cada migration gerada é aplicada contra o Postgres de teste (testcontainers) como parte do setup dos testes (`conftest.py` da task 20 roda `alembic upgrade head` contra o container efêmero antes da suíte).

## Notas de implementação (2026-08-21)
- `alembic` roda como script de console (não via `python -m`), então o `cwd` não entra automaticamente no `sys.path` — precisei adicionar `sys.path.insert(0, str(Path(__file__).resolve().parent.parent))` no topo do `env.py`, antes dos imports de `src.*`, senão dá `ModuleNotFoundError`.
- `ruff` reclama de `F401`/`I001` nos arquivos gerados em `alembic/versions/` (toda migration nova importa `op`/`sa`, mesmo vazia) — adicionei `per-file-ignores` pra essa pasta em `pyproject.toml`, em vez de deixar o ruff remover imports que a próxima migration real vai precisar de novo.
