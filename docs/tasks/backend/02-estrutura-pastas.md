# 02 — Estrutura de pastas (domain-driven)

## Objetivo
Criar o esqueleto de diretórios/arquivos do backend seguindo a estrutura domain-driven definida no plano — cada domínio de negócio (auth, ingest, prices, recipes, api_tokens) em seu próprio pacote, em vez de agrupar por tipo de arquivo (`routers/`, `models/` genéricos).

## Por que
Guias atuais de FastAPI em produção (ex: zhanymkanov/fastapi-best-practices, referência amplamente adotada) recomendam organizar por domínio — cada pacote junto com seu router, schemas, models e lógica de negócio — porque escala melhor conforme o projeto cresce. Um `routers/`/`models/`/`services/` genérico no topo funciona bem só pra projetos pequenos; o nosso já nasce com múltiplos domínios (auth, ingest, preços, receitas), então vale começar direito.

## O que implementar
Criar (arquivos vazios ou com só um `# TODO` inicial, sem lógica ainda — outras tasks preenchem):
```
backend/src/
├── __init__.py
├── main.py
├── config.py
├── database.py
├── celery_app.py
├── exceptions.py
├── auth/
│   ├── __init__.py
│   ├── models.py
│   ├── schemas.py
│   ├── manager.py
│   ├── router.py
│   └── dependencies.py
├── api_tokens/
│   ├── __init__.py
│   ├── models.py
│   ├── schemas.py
│   ├── router.py
│   └── service.py
├── ingest/
│   ├── __init__.py
│   ├── schemas.py
│   ├── router.py
│   └── tasks.py
├── prices/
│   ├── __init__.py
│   ├── models.py
│   ├── schemas.py
│   ├── router.py
│   └── service.py
├── recipes/
│   ├── __init__.py
│   ├── models.py
│   └── router.py
└── cache/
    ├── __init__.py
    └── redis_client.py

backend/scripts/
└── import_recipes.py

backend/tests/
├── __init__.py
├── conftest.py
├── auth/__init__.py
├── ingest/__init__.py
├── prices/__init__.py
└── recipes/__init__.py    # adicionado em 2026-08-21: faltava na lista original, mas as tasks 12/19 já referenciam tests/recipes/
```

Cada `__init__.py` fica vazio por enquanto (pacotes Python padrão, sem re-exports ainda — evita acoplamento prematuro).

## Bibliotecas/dependências
Nenhuma nova — só estrutura de arquivos.

## Depende de
Task 01 (ambiente/tooling já configurado).

## Testes manuais
1. `cd backend && uv run python -c "import src"` → não deve dar erro de import (confirma que os pacotes estão bem formados).
2. `find src -name "*.py" | wc -l` (ou equivalente) → confere que todos os arquivos listados acima existem.

## Testes automatizados
Nenhum ainda — sem lógica pra testar. `pytest --collect-only` deve rodar sem erro de coleta assim que a task 20 configurar o `conftest.py`.
