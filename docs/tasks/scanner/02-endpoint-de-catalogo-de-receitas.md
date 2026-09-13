# 02 — `GET /catalog/recipes`

> Corrige `X01`. É a task que faz receita sem preço **parar de sumir**.

## Objetivo

Servir o catálogo de receitas **inteiro**, sem depender de preço nenhum, numa resposta que o
navegador baixa uma vez e guarda.

## Por que

Hoje não existe endpoint que liste receitas. `src/recipes/router.py` tem **uma** rota
(`GET /items/{unique_name}/recipe`, um item por vez), e o único caminho "em massa" é o ranking
materializado — que é exatamente o que está errado:

`ranking_service.py:174-189` enumera as combinações a calcular a partir de um
`SELECT DISTINCT ... FROM market_order JOIN recipe ON recipe.output_item_unique_name =
market_order.item_id`. Ou seja: **a lista de receitas do produto é derivada do que já tem
preço**. Receita cuja saída nunca foi observada no mercado não gera linha em `recipe_ranking`,
e nenhum filtro na leitura traz de volta — a linha não existe.

Separar o catálogo (estático, muda em patch do jogo) do preço (volátil) desfaz isso na raiz. O
cliente passa a ter as 5.633 receitas na mão e decide sozinho o que mostrar.

## O que implementar

1. **Módulo novo `src/catalog/`** (`router.py`/`schemas.py`/`service.py`), seguindo o layout por
   domínio do projeto. Não estender `src/recipes/`, que serve o detalhe de um item.

2. **`GET /catalog/recipes?kind=refining|crafting`** (`kind` opcional; sem ele, tudo).
   Resposta **sem paginação** — o contrato é "o catálogo inteiro".

3. **Formato: dicionário de itens + receitas que o referenciam.** Um mesmo ingrediente aparece
   em centenas de receitas; repetir nome/tier/peso em cada uma multiplica o payload à toa.

   ```jsonc
   {
     "version": "<sha do dataset ativo>",
     "kind": "refining",
     "items": [
       { "unique_name": "T4_FIBER", "name_en": "…", "name_pt": "…", "tier": 4,
         "enchantment_level": 0, "weight": "0.51",
         "shop_category": "crafting", "shop_subcategory": "resources" }
     ],
     "recipes": [
       { "output_item": "T4_CLOTH", "production_kind": "refining",
         "silver_cost": 0, "crafting_focus": 18, "amount_crafted": 1,
         "upgrade_resource": null,
         "ingredients": [ { "item": "T4_FIBER", "count": 2 },
                          { "item": "T3_CLOTH", "count": 1 } ] }
     ]
   }
   ```

   `items` traz **todo item referenciado** — saída, ingrediente e recurso de upgrade —
   deduplicado. `ingredients` é ordenado por `position`, que fica implícito no índice do array.

4. **Uma consulta, nunca N+1.** `selectinload(Recipe.ingredients)` sobre 5.633 receitas, e um
   `SELECT` único de `item` para os `unique_name` referenciados. Teste com contador de queries.

5. **`ETag` + `304`.** O `ETag` deriva da versão ativa em `static_dataset_version` (o catálogo só
   muda quando o dataset muda) combinada com o `kind`. Requisição com `If-None-Match` casando
   responde **304 sem corpo**. `Cache-Control: private, max-age=300, must-revalidate` — privado
   porque a rota é autenticada como todas as outras.

6. **Contrato em inglês** (`B09`) — `test_api_language.py` varre o OpenAPI e o schema novo entra
   na varredura. `weight` e valores monetários viajam como **string decimal** (`F09`).

7. **Nada de preço, nada de frescor, nada de filtro que esconda linha.** O endpoint devolve o
   que existe no catálogo; filtrar é direito do cliente.

## Bibliotecas/dependências

Nenhuma nova. FastAPI `Response`/`Header`, SQLAlchemy `selectinload`.

## Depende de

Task **01** — `item.weight` precisa existir para entrar na resposta.

## Testes automatizados

- `?kind=refining` devolve **110** receitas; `?kind=crafting` devolve **5.523**; sem `kind`,
  5.633. Os números vêm de `docs/02-dados-de-receita.md:176-177`.
- **Uma receita cuja saída não tem nenhuma linha em `market_order` aparece na resposta.** É a
  regressão direta de `X01` — o teste que falha contra a arquitetura antiga.
- `items` contém todo `unique_name` referenciado pelas receitas devolvidas, sem duplicata, e
  traz `weight` para os que têm.
- Contador de queries: a resposta completa sai em número **constante** de statements,
  independente da quantidade de receitas (prova do item 4).
- `If-None-Match` com o ETag corrente devolve **304 e corpo vazio**; ETag diferente devolve 200.
- Rota exige autenticação (401 sem token), como as demais.
- `test_api_language.py` continua verde com os schemas novos.

## Testes manuais

```bash
TOKEN=...   # login
curl -s "localhost:8000/catalog/recipes?kind=refining" -H "Authorization: Bearer $TOKEN" \
  | python -c "import sys,json; d=json.load(sys.stdin); print(len(d['recipes']),'receitas',len(d['items']),'itens')"

# tamanho na rede, que é o critério de aceite
curl -s "localhost:8000/catalog/recipes?kind=crafting" -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Encoding: gzip" -o /tmp/cat.gz -w "gzip: %{size_download} bytes\n"
```

**Critério de aceite: o catálogo de craft inteiro cabe em ≤ 200 KB gzipped.** Se estourar,
encurtar o payload (omitir campo nulo, `enchantment_level` só quando ≠ 0) antes de recorrer a
paginação — paginar o catálogo reintroduz o problema que a fase existe para resolver.

## Estado da implementação

**Concluída.** Backend: `uv run pytest tests/ -q` → **365 passed** (+11) · `ruff check`/`format`
limpos. Frontend: `npm run typecheck` limpo · `npm run test` **204/204** (nada quebrou) ·
`schema.d.ts` regerado com os 5 schemas novos.

- **`src/catalog/`** (`schemas.py`/`service.py`/`router.py`) — módulo novo, layout por domínio.
  Não estendeu `src/recipes/`, que serve o detalhe de um item.
- **`GET /catalog/recipes?kind=`** — `Literal["refining","crafting"] | None`, autenticada,
  `ETag` + `Cache-Control: private, max-age=300, must-revalidate`, `304` em `If-None-Match`.
- **`GZipMiddleware(minimum_size=1024)`** em `src/main.py` — o catálogo é a maior resposta do
  produto e o cliente baixa o conjunto inteiro de propósito; sem compressão seriam ~3 MB por
  cliente. `minimum_size` deixa as respostas pequenas em paz.
- O `ETag` deriva do `manifest_sha256` do dataset ativo **combinado com o `kind`** — sem isso,
  `?kind=refining` e `?kind=crafting` compartilhariam validador e o cache entregaria o catálogo
  errado.

### Guard em vermelho antes da correção

Removendo `selectinload(Recipe.ingredients)` do `service.py`, o endpoint **nem funciona**:
`sqlalchemy.exc.MissingGreenlet` — SQLAlchemy async proíbe lazy-load implícito. É um sinal mais
forte que a diferença de contagem que o teste procura: o N+1 é impossível de passar batido.

### Medição com o catálogo real

| `kind` | Receitas | Itens no dicionário | Cru | **Gzip** | Tempo |
|---|---:|---:|---:|---:|---:|
| `refining` | **110** | 220 | 79 KB | **4,6 KB** | 65 ms |
| `crafting` | **5.523** | 5.731 | 2,99 MB | **107 KB** | 0,80 s |
| *(sem filtro)* | **5.633** | 5.805 | — | **110 KB** | — |

As contagens batem exatamente com `docs/02-dados-de-receita.md:176-177`. **Critério de aceite
cumprido com folga: 107 KB contra o teto de 200 KB.** A razão de compressão é 27× — o formato
"dicionário de itens + receitas" deixa o JSON muito repetitivo, que é o melhor caso do gzip.

Revalidação medida na rede real: **304 em 6 ms com 0 bytes**, contra 0,80 s e 107 KB do corpo
completo.

O catálogo inteiro do jogo cabe em 110 KB — menos que duas imagens de item a 217px.

### Pendente pra você testar

Nada. Esta task não tem superfície visual; a prova é o número de receitas e o tamanho na rede,
ambos medidos acima.
