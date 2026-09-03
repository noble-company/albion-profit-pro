# 07 — Idioma único da API

> Corrige `B09`.

## Objetivo

Fazer todo o contrato HTTP falar um idioma só — inglês — sem quebrar o frontend no meio do
caminho.

## Por que

`/items/{id}/prices` e `/items/{id}/demand` respondem em português: `venda`, `compra`,
`vendido_24h`, `cobertura`, `janela_frescor_segundos`, `idade_segundos`, `observado_em`,
`melhor_preco`, `unidades_observadas`, `serie_6h`. `/craft/*` e `/opportunities/*` respondem em
inglês: `profit`, `roi`, `total_cost`, `warnings`, `oldest_observed_at`, `age_seconds`.

O `CLAUDE.md` do projeto é explícito: código e identificadores seguem convenção inglesa; a
comunicação e a prosa dos docs é que são em português. O frontend paga a conta misturando os
dois no mesmo componente — `row.venda.melhor_preco` ao lado de `row.profit`.

Isto **não** vale para o contrato de ingest, que espelha o wire do client Go
(`Field(alias="ItemTypeId")` etc.) e é intocável por decisão registrada no `CLAUDE.md`.

## O que implementar

1. Renomear os campos de resposta de `prices/schemas.py` para inglês, mantendo os nomes de
   domínio corretos: `sell`/`ask` e `buy`/`bid` conforme o glossário que a task fixar,
   `best_price`, `observed_units`, `observed_orders`, `observed_at`, `age_seconds`,
   `sold_24h`, `coverage`, `freshness_window_seconds`, `series_6h`.
2. Renomear as classes correspondentes (`LadoDoLivro`, `VolumeVendido`, `PrecoPorLocal`,
   `LivroOut`, `VendidoOut`, `PontoSerie6h`, `ItemResumo`) e os campos internos que vazam para
   o schema (`tem_receita`, `tem_receita_propria`, `variantes_encantadas`, `fonte`).
3. Decidir e registrar o alcance: apenas o **contrato HTTP**, ou também as colunas do banco
   (`fonte`, `n_varreduras`, `primeira_em`, `ultima_em`, `preco_medio`, `dia`, `mes`). Renomear
   coluna exige migration; se ficar fora, dizer explicitamente que fica.
4. Ciclo de depreciação: publicar os dois nomes por uma versão, marcando os antigos como
   deprecated no OpenAPI, e só então remover. Como o único consumidor é o nosso frontend, o
   ciclo pode ser curto — mas precisa ser deliberado, não um big bang.
5. Regenerar `frontend/src/api/schema.d.ts` e atualizar os consumidores no mesmo commit.
6. Fixar a regra no `CLAUDE.md` e no README da fase, para não voltar a divergir.

## Depende de

Task 04 (o contrato de resultado precisa estar estabilizado antes de renomear em massa).

## Testes automatizados

- Nenhum campo do OpenAPI, fora das rotas de ingest, casa com o dicionário de termos em
  português definido na task (verificação automatizada sobre o schema gerado).
- Os testes existentes de `tests/prices/` continuam verdes com os nomes novos.
- `schema.d.ts` regenerado compila e o frontend passa em `typecheck`.

## Testes manuais

Abrir `/docs` e confirmar que um leitor externo consegue entender a API inteira sem saber
português.

## Estado da implementação

Concluída em 2026-08-31.

### 1–2. Renomeações

`prices/schemas.py` reescrito: `LadoDoLivro`→`BookSide`, `VolumeVendido`→`SoldVolume`,
`PrecoPorLocal`→`LocationPrice`, `ItemResumo`→`ItemSummary`, `LivroOut`→`BookOut`,
`VendidoOut`→`SoldOut`, `PontoSerie6h`→`Series6hPoint`. Campos: `melhor_preco`→`best_price`,
`unidades_observadas`→`observed_units`, `ordens_observadas`→`observed_orders`,
`observado_em`→`observed_at`, `idade_segundos`→`age_seconds`, `venda`→`sell`, `compra`→`buy`,
`vendido_24h`→`sold_24h`, `cobertura`→`coverage`, `janela_frescor_segundos`→
`freshness_window_seconds`, `unidades`→`units`, `preco_medio`→`average_price`, `nome`→`name`,
`inicio`→`start`, `livro`→`book`, `vendido`→`sold`, `serie_6h`→`series_6h`,
`ultimas_24h/7d/30d`→`last_24h/7d/30d`. `prices/service.py` monta as chaves novas (inclusive o
cache Redis e o payload sem-consumidor de `publish_price_update`). `items/schemas.py`
`tem_receita`→`has_recipe`; `recipes/schemas.py` `tem_receita_propria`→`has_own_recipe`,
`variantes_encantadas`→`enchanted_variants`. `description=` dos endpoints traduzidas.

### Glossário do livro

`sell` = lado das ofertas (`offer`, ask — onde você compra) · `buy` = lado das procuras
(`request`, bid — onde você vende). Mesma semântica do PT antigo (`venda`/`compra`). Fixado no
`CLAUDE.md` e no README da fase.

### 3. Alcance — só o contrato HTTP

Colunas de banco (`fonte`, `n_varreduras`, `primeira_em`, `ultima_em`, `preco_medio` de
`market_history_*`, `dia`, `mes`, `busca_normalizada`) e os labels de query interna de
`query_book_depth` (`menor_venda`, `venda_unidades`, …) **ficam em português** — são internos,
sem contrato externo. Registrado no `W3`.

### 4. Ciclo de depreciação — cutover coordenado (desvio deliberado da spec)

Sem dual-publish. O único consumidor é o nosso frontend, atualizado no mesmo commit: schema
antigo e novo nunca coexistem para ninguém. Publicar `venda` **e** `sell` no mesmo schema por
uma versão dobraria a superfície sem proteger nenhum consumidor. Aprovado.

### 5–6. Frontend e regra fixada

`schema.d.ts` regenerado; `prices/{pages,demand}.tsx`, `items/{pages,items.test}.tsx` atualizados.
Regra no `CLAUDE.md` (bullet novo) e no README da fase, com o teste `test_api_language.py` como
guarda.

### `api_tokens` fora de escopo → `W3`

`ApiTokenPublic.token_sufixo`/`nome`/`ultimo_uso_em` seguem em PT — o gêmeo `ClientIdentity` é
parseado pelo client Go. Task própria coordenada com o client.

### Testes

- `uv run pytest tests/ -q` → **333 passed**. `uv run ruff check .` → limpo.
- `tests/test_api_language.py` (novo): varre o OpenAPI e falha se qualquer campo fora de `*In` /
  `ApiTokenPublic` casar com o dicionário PT; confirma que os aliases de ingest (`ItemTypeId`…)
  seguem intactos.
- `tests/prices/`, `tests/items/`, `tests/recipes/`, `tests/ingest/` atualizados para os nomes
  novos (contrato) mantendo os valores de banco (`livro`/`historico` de `MarketScan.fonte`,
  `preco_medio` de `MarketHistoryDaily`).
- Frontend `npm run lint && npm run typecheck && npm run test` → 0 erros, 24 verdes.
