# 06 — Contrato inglês completo e guard que enxerga

> Corrige `E07`. Absorve o `W3` da Fase 3.5.

## Objetivo

Fechar o que a task 3.5/07 (`B09`) deixou de fora e substituir o teste que deveria ter pego por
um que pega.

## Por que

O `CLAUDE.md:42` afirma que todo campo de request/response de toda rota é inglês, com **uma**
exceção (os schemas de ingest `*In`). O contrato real tem mais do que isso.

**Nomes em português no wire:**

| Onde | O quê |
|---|---|
| `backend/src/items/router.py:17-18` | query params `categoria` e `apenas_craftaveis` de `GET /items/search` — o serviço interno já recebe `category=`/`craftable_only=` (`:30-31`); só o wire ficou em PT |
| `backend/src/api_tokens/schemas.py:22,23,26,39` | `token_sufixo`, `nome`, `ultimo_uso_em` (`W3`) |

**Valores em português no payload:**

| Onde | O quê |
|---|---|
| `backend/src/craft/constants.py:29-33` | `dado_velho`, `profundidade_insuficiente`, `sem_preco`, `sem_cobertura`, `ordem_nao_garantida` — viajam em `/craft/*` e `/opportunities/*` |
| `backend/src/prices/schemas.py:37,64` | `coverage: Literal["parcial"]` |
| `backend/src/craft/compare_service.py:292-311` | `unavailable_reason` |
| `backend/src/main.py:127-147` | `/ready` devolve `"ausente"`/`"erro"` |
| Todo `HTTPException.detail` | `item_nao_encontrado`, `termo_de_busca_vazio`, `receita_indisponivel`, … |

Tudo isso atravessa para o cliente: `frontend/src/api/schema.d.ts:2316-2317` (`categoria`,
`apenas_craftaveis`), `:594,596,605` (token), `:646,992,1155` (`parcial`, `dado_velho`).

**E o guard não vê nada disso.** `backend/tests/test_api_language.py`:

- `:14-33` é uma **denylist de 18 strings legadas** — a lista exata dos nomes que existiam antes
  do rename da 3.5/07. Não é detecção de português: `nome`, `categoria`, `lucro` e
  `preco_unitario` passam todos. `preco` sozinho nem está na lista.
- `:38-43` percorre só `components.schemas.*.properties`. Query params vivem em
  `paths.*.*.parameters` e **nunca são visitados**.
- Enums e `Literal` não têm `properties`, então os cinco warnings e o `"parcial"` são invisíveis.
- `:40` isenta qualquer schema cujo nome termine em `In` — `LoginIn`, `SignIn`, `CheckIn` entram
  de graça.
- Nada verifica que uma rota nova está coberta.

`ApiTokenPublic` e `ClientIdentity` **são** exceção deliberada e estão documentadas no docstring
do teste (`:3-6`) — o problema não é existirem, é o `CLAUDE.md` afirmar que a exceção é uma só.

## O que implementar

1. Renomear os query params para `category` e `craftable_only`, aceitando os nomes antigos por um
   ciclo de depreciação (o frontend está no ar). O rename atravessa
   `frontend/src/items/service.ts:8-9`, `src/items/pages.tsx:29-30`, `src/craft/pages.tsx:208` e
   exige `npm run api:types`.
2. **Decidir explicitamente** o destino dos valores em português. São identificadores estáveis
   consumidos pelo cliente (`src/design/confidence.ts:11,19` mapeia `dado_velho`), então há duas
   saídas defensáveis: traduzir com depreciação, ou declarar que valores de enum são
   identificadores internos e registrar a exceção. **Escolher uma e escrever a decisão** — o que
   não pode continuar é a afirmação e o código discordarem.
3. Mesma decisão para `HTTPException.detail` e para o payload de `/ready`.
4. Reescrever `test_api_language.py`:
   - varrer `paths.*.*.parameters` além de `components.schemas.*.properties`;
   - varrer `enum` e `const` além de nomes;
   - trocar a denylist por **allowlist explícita** de exceções documentadas, falhando em qualquer
     identificador fora dela que case um padrão de português;
   - restringir a isenção `*In` aos schemas de ingest reais, por lista, não por sufixo;
   - falhar quando uma rota nova aparecer sem estar na cobertura.
5. Atualizar `CLAUDE.md:42` e `AGENTS.md:42` para descrever as exceções que existirem depois da
   decisão do item 2.

## Depende de

Task 05 (nada técnico, só para não empilhar duas mudanças de contrato com o CI vermelho).

## Testes automatizados

- O teste novo **falha** contra o código atual, apontando `categoria`, `apenas_craftaveis` e os
  valores de enum — registrar a execução em vermelho antes da correção.
- `GET /items/search?category=...` funciona; `?categoria=...` funciona e emite aviso de
  depreciação.
- `frontend`: `npm run typecheck` verde depois de regenerar `schema.d.ts`.

## Testes manuais

Abrir a busca de itens e a Calculadora com filtro de categoria e confirmar que o filtro continua
funcionando com o nome novo.

## Estado da implementação

**Concluída** (2026-09-22). `uv run pytest tests/ -v` (487 testes, 1 skip pré-existente) e
`uv run ruff check .`/`ruff format --check .` verdes no backend; `npm run lint && npm run
typecheck && npm run test` (595 testes) verdes no frontend depois de `npm run api:types`
regenerar `schema.d.ts` contra o backend local.

- **Decisão do item 2/3** (traduzir vs. declarar exceção): **traduzir tudo pra inglês, sem
  período de depreciação nas respostas** — backend e frontend deployam juntos, e o frontend já
  tem fallback gracioso pra chave de warning desconhecida. Evidência que decidiu: todo outro
  valor de enum do contrato já era inglês (`immediate`, `top_of_book`, `all`, `west`...);
  `coverage: Literal["parcial"]` era o único outlier. Só os **query params** (`categoria`,
  `apenas_craftaveis`) ganharam depreciação (`deprecated=true` no schema, nome antigo ainda
  aceito com log de aviso) — são entrada, e um bundle de frontend antigo pode estar aberto.
- **Renomeado para inglês:** `CraftWarning` (`stale_data`, `insufficient_depth`, `no_price`,
  `no_coverage`, `order_not_guaranteed`), `coverage` (`partial`), `/ready` (`missing`/`error`),
  as razões de `compare_service.py` (`item_has_no_enchantment`, `base_recipe_unavailable`,
  `upgrade_recipe_level_N_unavailable`, `upgrade_resource_level_N_unavailable`), os `detail` de
  `HTTPException` em `items`/`craft`/`recipes`/`api_tokens` (`item_not_found`,
  `recipe_unavailable`, `invalid_override`, `empty_search_term`, mensagens de token).
- **Achados além do que a spec listou** (achados durante a implementação, não estavam no "Por
  que" original): `main.py`'s `"Content-Length inválido"` (400 de qualquer rota, inclusive
  ingest), `auth/manager.py`'s duas mensagens de `InvalidPasswordException.reason` (aparecem no
  400 de `/auth/register`), e `ingest/schemas.py`'s validador `_not_blank` (`"não pode ser
  vazio"` no `msg` de um 422). Todos traduzidos. `quarantine/service.py` tem mensagens em
  português (`ValueError`/`LookupError`) mas **não é wire** — só `scripts/quarantine.py` (CLI
  de operador) as chama; fora do escopo desta task de propósito.
- **Guard reescrito** (`test_api_language.py`): três testes novos —
  `test_openapi_has_no_portuguese_property_names`, `..._enum_or_const_values`,
  `..._query_parameters` — varrendo `paths.*.*.parameters`, `enum` e `const`, com **allowlist
  explícita** (`INGEST_WIRE_SCHEMAS` como lista, não sufixo — `DestinyBoardIn` não é ingest e
  hoje escapava do scan antigo só pelo nome; `DOCUMENTED_PROPERTY_EXCEPTIONS` para
  `ApiTokenPublic`/`ClientIdentity`) em vez da denylist de 18 strings legadas. Detecção por
  diacrítico (`áàâã...`) + lista de raízes portuguesas — não é NLP, é vocabulário mais amplo.
  **Guard em vermelho antes da correção:** revertido temporariamente só o código-fonte (`git
  stash` dos arquivos de produção, mantendo o teste novo) e rodado contra o estado antigo —
  falhou exatamente em `categoria`, `apenas_craftaveis` e os 7 valores de enum PT, confirmando
  que o guard pega o defeito de verdade antes de restaurar a correção.
- **`CLAUDE.md:42`/`AGENTS.md:42`** reescritos para descrever as exceções por extenso.

### Desvios da spec

- Os três achados extras (Content-Length, senha, ingest blank) não estavam na seção "Por que" da
  spec original — encontrados varrendo `src/` por diacríticos durante a implementação. Corrigidos
  porque são de baixo risco e sem teste externo dependendo do valor antigo; documentados aqui em
  vez de virarem uma task própria, já que são triviais.
- O guard novo **não pode** cobrir mensagens de exceção livres como as três acima: o schema
  OpenAPI não enumera o conteúdo dinâmico de um `detail`/`msg` de erro, só a forma
  (`{"detail": "string"}`). Isso é um limite estrutural de um guard baseado em schema, não uma
  lacuna desta implementação — registrado aqui para quem for procurar o próximo vazamento
  parecido.

### Guard em vermelho (evidência)

```
AssertionError: Portuguese enum/const values in the HTTP contract: BookOut.coverage const
'parcial', CraftWarning enum 'dado_velho', CraftWarning enum 'profundidade_insuficiente',
CraftWarning enum 'sem_preco', CraftWarning enum 'sem_cobertura', CraftWarning enum
'ordem_nao_garantida', LocationPrice.coverage const 'parcial'

AssertionError: Portuguese query parameters in the HTTP contract: GET /items/search ?categoria,
GET /items/search ?apenas_craftaveis
```
