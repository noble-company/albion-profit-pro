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
