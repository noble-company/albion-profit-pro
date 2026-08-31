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
- Migration segura para banco populado: extensão `pg_trgm`, coluna `item.busca_normalizada`,
  backfill de todas as linhas existentes, validação de ausência de nulos e só então restrição/índice
  GIN trigram. Documentar que produção precisa permitir ou precriar a extensão. Normalização
  determinística em Python (lowercase, Unicode NFKD, sem diacríticos) compartilhada pelo import,
  pelo backfill e pela consulta.
- Atualizar `scripts/import_items.py` para preencher a coluna no upsert.
- Integrar o seed idempotente dos nomes de cidades ao comando canônico `scripts.seed_static_data`,
  mesmo que implementado num módulo interno separado. Usar somente IDs confirmados por
  captura/banco; desconhecidos continuam com nome nulo e a API devolve o ID como fallback. Não
  criar um segundo passo manual de deploy.
- Alterações na transformação do catálogo precisam invalidar explicitamente a identidade do seed
  (por revisão de transformação versionada no manifesto/contrato equivalente). Um ambiente com o
  manifesto anterior ativo deve reaplicar a transformação; reexecutar a mesma revisão depois deve
  retornar `unchanged`.
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
planner. Testar migration sobre banco já populado, upgrade de seed anterior, idempotência da nova
revisão e o único comando canônico populando catálogo e cidades.

## Implementação concluída em 2026-08-23

- Catálogo autenticado exposto em `GET /items/search`, `GET /items/{unique_name}` e
  `GET /locations`, com filtros, limite, indicação de receita, fallback de localização e erros
  semânticos estáveis.
- Normalização `item-search-v1` compartilhada pelo import, backfill e consulta. A busca ignora
  caixa/diacríticos e escapa curingas SQL fornecidos pelo usuário.
- Migration segura cria `pg_trgm`, preenche catálogos existentes antes do `NOT NULL` e adiciona
  índice GIN trigram. A permissão operacional da extensão está registrada em
  `docs/06-fontes-de-dados-estaticos.md`.
- O seed canônico passou a validar também o `world.json` da mesma revisão imutável, importar em uma
  única transação os mercados confirmados `1002/Lymhurst` e `5003/Brecilien` e invalidar revisões
  anteriores por `transform_revision` versionada.
- Manifesto real validado: 12.062 itens, 5.553 receitas e 2 localizações curadas. As consultas
  `algodao`, `algodão`, `cotton` e `T4_CLOTH` foram verificadas contra o catálogo real.
- Validações finais: Ruff global aprovado; 21 testes focados aprovados; suíte completa do backend
  com 252 testes aprovados. Resta somente a conferência visual pelo frontend quando as telas da
  fase estiverem disponíveis; ela não bloqueia este contrato de backend.
