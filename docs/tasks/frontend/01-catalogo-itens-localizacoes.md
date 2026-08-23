# 01 — Catálogo de itens e localizações

## Objetivo
Expor busca autenticada de itens, detalhe canônico e lista utilizável de localizações.

## Por que
`item` tem 12.062 linhas, mas nenhuma rota. Mandar os 24 MB de `items.json` ao navegador duplica
fonte de verdade e torna a busca ruim. `location` existe, porém nomes continuam opcionais.

## O que implementar
- Criar `src/items/schemas.py` e `src/items/router.py`; ampliar `src/items/service.py`.
- `GET /items/search` com `q`, `tier`, `enchantment_level`, `categoria`,
  `apenas_craftaveis` e `limit` (1-50). Retornar `unique_name`, `albion_id`, nomes PT/EN, tier,
  encantamento, categorias e `tem_receita`.
- `GET /items/{unique_name}` e `GET /locations`; todas exigem JWT.
- Migration: extensão `pg_trgm`, coluna `item.busca_normalizada` e índice GIN trigram. Documentar
  que produção precisa permitir/precriar a extensão. Normalização determinística em Python
  (lowercase, Unicode NFKD, sem diacríticos) compartilhada pelo import e pela consulta.
- Atualizar `scripts/import_items.py` para preencher a coluna no upsert.
- Seed idempotente separado para nomes de cidades, usando somente IDs confirmados por captura/banco;
  desconhecidos continuam com nome nulo e a API devolve o ID como fallback.
- Registrar o router antes do router dinâmico de preços.

## Bibliotecas/dependências
SQLAlchemy/PostgreSQL existentes; nenhuma dependência Python nova.

## Depende de
Backend task 28 concluída.

## Testes manuais
Buscar `algodao`, `algodão`, `cotton` e `T4_CLOTH`; confirmar o mesmo conjunto esperado e o
fallback de localização sem nome.

## Testes automatizados
Cobrir acento, idiomas, unique name, filtros, limite, `tem_receita`, 401 e `/locations`. Confirmar
plano de consulta usando o índice em volume representativo sem tornar o teste frágil ao custo do
planner.
