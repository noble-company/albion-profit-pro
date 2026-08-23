# 01 — Ambiente e tooling

## Objetivo
Deixar o projeto `backend/` com um ambiente Python reprodutível, gerenciado por `uv`, pinado em **Python 3.13** (não 3.14 — ver motivo abaixo), com lint/format via `ruff` e hooks de pre-commit configurados. Esta é a base de tudo — nenhuma outra task começa antes desta.

## Por que
- **Python 3.13, não 3.14**: o Celery (escolhido na decisão de fila de tasks) ainda não tem release estável com suporte classificado para Python 3.14 (última estável 5.6.3 só lista até 3.13). Rodar em 3.14 arriscaria quebras silenciosas de compatibilidade num componente crítico (o worker que grava tudo no banco). `uv` permite pinar 3.13 só para este projeto, sem tocar no Python 3.14 já instalado globalmente na máquina.
- **uv**: mais rápido que Poetry (instala em paralelo, escrito em Rust), gerencia a própria versão do Python por projeto (`uv python pin`), lê `pyproject.toml` padrão (sem lock-in a formato proprietário).
- **ruff**: substitui black+flake8+isort+pylint num binário só, 10-100x mais rápido, é o padrão de fato em projetos Python novos em 2026.

## O que implementar
1. Instalar `uv` (se ainda não estiver disponível): `pip install uv` ou instalador oficial.
2. Dentro de `backend/`:
   ```bash
   uv python pin 3.13
   uv init --name albion-profit-pro-backend --package
   ```
   **Nota (implementado em 2026-08-21)**: `--package` gera um layout de biblioteca distribuível (`src/albion_profit_pro_backend/`, com `[build-system]`/`uv_build` e `[project.scripts]`) — isso **não bate** com o layout `src/` plano que todas as tasks seguintes assumem (`from src.config import ...`, `uv run uvicorn src.main:app`). Correção aplicada: apagar a pasta `src/albion_profit_pro_backend/` gerada e o `README.md` padrão, e escrever o `pyproject.toml` manualmente pra um projeto "aplicação" (ver passo 3) — sem `[build-system]`, com `[tool.uv] package = false`. O `src/` plano em si fica pra task 02 criar (não existe ainda depois desta task, por design).
3. Editar/escrever `pyproject.toml` — seções principais:
   ```toml
   [project]
   name = "albion-profit-pro-backend"
   version = "0.1.0"
   requires-python = ">=3.13,<3.14"
   dependencies = []

   [tool.uv]
   package = false  # projeto "aplicação", não biblioteca distribuível — evita a necessidade de src/<nome>/ + build-system

   [tool.ruff]
   target-version = "py313"
   line-length = 100

   [tool.ruff.lint]
   select = ["E4", "E7", "E9", "F", "I", "B"]  # conservador pra começar

   [tool.pytest.ini_options]
   asyncio_mode = "auto"
   ```
4. `uv add fastapi "uvicorn[standard]"` — framework web + servidor ASGI. `uvicorn[standard]` (em vez do pacote básico) traz `uvloop`/`httptools`, que aceleram bastante o loop de eventos e o parsing HTTP em produção — sem motivo pra não usar o extra.
5. `uv add --dev ruff pre-commit`
6. Criar `.pre-commit-config.yaml` na raiz de `backend/`:
   ```yaml
   repos:
     - repo: https://github.com/astral-sh/ruff-pre-commit
       rev: v0.16.4  # versão do ruff instalado em 2026-08-21 (confirmar se ainda é a mais recente ao reimplementar)
       hooks:
         - id: ruff
           args: [--fix]
         - id: ruff-format
   ```
7. `uv run pre-commit install` (instala o git hook — só funciona depois que o repo git da raiz do projeto existir, o que já foi feito).

## Bibliotecas/dependências
- `uv` (ferramenta, não dependência do projeto)
- `fastapi`
- `uvicorn[standard]` — servidor ASGI que roda a aplicação (dev: `--reload`; produção: atrás do Traefik, ver task 21)
- `ruff` (dev dependency)
- `pre-commit` (dev dependency)

## Depende de
Nada — é a primeira task.

## Testes manuais
1. `cd backend && uv run python --version` → deve imprimir `Python 3.13.x`.
2. `uv run uvicorn --version` → confirma que o uvicorn instalou corretamente com o extra `[standard]`.
3. `uv run ruff check .` → roda sem erro de configuração (pode reclamar de arquivos vazios, tudo bem nesta task).
4. `git commit --allow-empty -m "test"` dentro de `backend/` (ou arquivo dummy) → confirma que o hook do pre-commit dispara.

## Testes automatizados
Nenhum ainda — esta task é só infraestrutura de tooling, sem código de aplicação. A task 20 cobre o setup de testes propriamente dito.
