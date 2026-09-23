# A02 — Filtros do Market Flip que dependem do servidor

> Ajuste depois do fechamento da Fase 4 ([README](README.md#ajustes-depois-do-fechamento)). Não
> reabre a contagem da fase. Segue a [A01](A01-market-flip-no-visual-do-scanner.md), que monta a
> barra onde estes filtros aparecem.

## Objetivo

Duas perguntas que o Market Flip não sabe responder hoje passam a ter filtro:

1. **"Compro aqui, vendo ali."** Cidades de compra e de venda escolhidas separadamente.
2. **"T4 e T5", ".1 e .2", "Normal e Bom".** Tier, encantamento e qualidade com vários valores.

As duas mudam o endpoint `GET /opportunities/flips`; o cálculo continua em SQL, como está.

## Por que

Conferido no código, 2026-09-13:

| # | O que acontece | Evidência |
|---|---|---|
| 1 | **O filtro de cidades vale para as duas pontas.** `location_id` corta o livro antes de as rotas serem formadas, então marcar Martlock traz só Martlock → Martlock (que a própria query exclui) ou nada. Não existe "comprar em Martlock e vender em qualquer lugar". | `backend/src/opportunities/service.py:113-114`, `:200-207` |
| 2 | **Tier, encantamento e qualidade aceitam um valor**, comparado com `==`. | `backend/src/opportunities/router.py:50-52`; `service.py:35-36,115-118` |
| 3 | O scanner já pergunta assim — "Vender em" e "Comprar em" separados, tier e encantamento em chips múltiplos. O Flip é a única tela onde "T4 e T5" não se pede. | `frontend/src/scanner/BarraDoCenario.tsx:74-100`; `components/filters/index.tsx:79-88` |

**A busca por nome não entra aqui:** ela já existe no servidor. `item_id` procura o texto dentro
do nome normalizado (`service.py:20-25`, índice trigram), só nunca foi ligado na tela. Vai na A01.

## Decisões propostas (confirmar no resumo antes de implementar)

| # | Proposta | Por quê |
|---|---|---|
| 1 | **`buy_location_id` e `sell_location_id` (listas) substituem `location_id`.** Lista vazia = qualquer cidade. | O único consumidor é o nosso frontend. Manter os três criaria duas formas de pedir a mesma coisa, e `location_id` junto de `buy_location_id` não tem significado óbvio. |
| 2 | **`tier`, `enchantment_level` e `quality_level` viram listas com o mesmo nome.** `?tier=4` continua válido (lido como `[4]`); `?tier=4&tier=5` é T4 **ou** T5. Cada valor validado na faixa (1-8, 0-4, 1-5): fora dela, 422 antes do SQL. | Mudança compatível: link e chamada antigos seguem funcionando. |
| 3 | **Na URL da tela, `buy_in` e `sell_in`**, os mesmos nomes do scanner. Link antigo com `location_id` é lido como as duas listas — o significado que ele tinha. | Mesma palavra para a mesma coisa em todas as telas; link salvo não perde o filtro em silêncio. |
| 4 | **Na barra, "Comprar em" antes de "Vender em"**, na ordem da coluna Rota (compra → venda). | No scanner a ordem é a inversa porque a pergunta começa pela venda; aqui a rota se lê da compra. |

## O que implementar

### Backend

1. **`src/opportunities/router.py`** — os parâmetros novos (`list[str]` para cidades; lista de
   inteiros com faixa por valor para tier, encantamento e qualidade). As listas entram em
   `cache_params` **normalizadas** (ordenadas, sem repetição): `?tier=5&tier=4` e `?tier=4&tier=5`
   são a mesma consulta e a mesma chave de cache.
2. **`src/opportunities/service.py`**:
   - tier, encantamento e qualidade passam de `==` para `IN`, no mesmo lugar de hoje — no `base`,
     antes da janela, para o livro encolher cedo;
   - `best_offers` filtra pelas cidades de compra; `best_requests`, pelas de venda
     (`_best_side`, `:131-161`);
   - quando **as duas** listas vêm preenchidas, o `base` filtra pela união delas — não há motivo
     para a janela varrer cidade que nenhuma das pontas usa. Com só uma preenchida, o `base` não
     filtra cidade (a outra ponta é qualquer uma);
   - a mesma cidade nas duas listas continua sem rota para ela mesma (`:206`).
3. **Contagem de consultas constante.** O docstring promete duas consultas por requisição
   independentemente do tamanho do livro, e `test_flip_query_count_is_constant_regardless_of_dataset_size`
   (`tests/opportunities/test_flips.py:319-378`) trava isso. Os filtros novos são predicados
   nas CTEs existentes, não consultas a mais.
4. **OpenAPI:** regenerar `frontend/src/api/schema.d.ts` no mesmo commit (convenção da fase).

### Frontend

5. **`src/opportunities/service.ts`** — `OpportunityQuery` ganha `buyLocations`, `sellLocations`,
   `tiers`, `enchantments`, `qualities` (listas) no lugar de `locations`, `tier`, `enchantment`,
   `quality`; `getFlipOpportunities` envia os parâmetros novos.
6. **`src/opportunities/useOpportunityParams.ts`** — lê as listas repetidas da URL (`getAll`) e o
   `location_id` antigo como as duas listas.
7. **Barra de filtros do Flip** (montada na A01):
   - grupo Mercado: **Comprar em** e **Vender em**, cada um em `FilterChips` com as cidades de
     `useMarketToggles` (a cidade com dois mercados continua um chip só), nenhum marcado = todas;
   - grupo Item: Tier, Encantamento e Qualidade em `FilterChips`, no formato do scanner
     (`T4`, `.1`, nome da qualidade).

## Depende de

- **A01** — a barra lateral onde os controles novos entram.
- Não depende da 3.6/09 (índice trigram no modelo): esta task não gera migração.

## Fora de escopo

- **Mercado Negro como destino com regra própria** (só compra, sem ordem de venda): hoje ele é uma
  cidade como as outras nos dados do flip; mudar isso é outra conversa.
- **O modelo do scanner para o Flip** — decisão 1 da A01.

## Testes automatizados

Backend (`tests/opportunities/test_flips.py`), cada um rodado **vermelho** antes da mudança e
registrado abaixo:

- **só compra**: com `buy_location_id=A`, toda rota compra em A e vende em qualquer outra cidade
  com procura;
- **só venda**: o espelho, com `sell_location_id=B`;
- **as duas**: toda rota compra numa cidade da primeira lista e vende numa da segunda; a mesma
  cidade nas duas listas não vira rota para ela mesma;
- **tier múltiplo**: `?tier=4&tier=5` traz T4 e T5 e não traz T6; `?tier=4` segue funcionando. O
  mesmo para encantamento e qualidade;
- **faixa**: `?tier=9` e `?enchantment_level=5` respondem 422;
- **cache**: a mesma consulta com a ordem dos valores trocada usa a mesma chave;
- os testes que hoje mandam `location_id` (`:65`, `:210`, `:231`) passam a mandar as listas novas;
- `test_flip_query_count_is_constant_regardless_of_dataset_size` segue verde, agora também com
  `buy_location_id`, `sell_location_id` e `tier` na medição;
- `uv run pytest tests/ -v && uv run ruff check .`.

Frontend:

- `service` envia as listas; `useOpportunityParams` lê valores repetidos e o `location_id` antigo;
- `pages.test.tsx`: marcar um chip de Comprar em ou de Tier escreve a URL e dispara a consulta com o
  parâmetro novo;
- `npm run lint && npm run typecheck && npm run test`.

## Testes manuais

Com a API e o client no ar, em `/` com um servidor escolhido:

1. **Comprar em** Martlock, sem Vender em: toda linha compra em Martlock, e as vendas se espalham
   pelas outras cidades.
2. Somar **Vender em** Caerleon: só sobra Martlock → Caerleon.
3. Tier T4 e T5 marcados: aparecem os dois, e nenhum T6.
4. Abrir um link antigo com `?location_id=…`: o filtro continua valendo, nas duas pontas.

## Estado da implementação

**Concluída em 2026-09-13.**

### Entregue

- O endpoint aceita `buy_location_id` e `sell_location_id` repetidos e aplica cada lista ao lado
  correto do livro. Quando ambas existem, a CTE-base considera somente a união das cidades.
- Tier, encantamento e qualidade aceitam valores repetidos, continuam validando cada elemento e
  usam `IN` nas CTEs existentes. As chaves de cache ordenam e removem repetições das cinco listas.
- O contrato OpenAPI do frontend foi regenerado. A tela envia os parâmetros novos, persiste
  `buy_in`/`sell_in` e converte links antigos com `location_id` para as duas pontas.
- A barra do Flip mostra chips separados para Comprar em/Vender em e seleção múltipla de tier,
  encantamento e qualidade.

### Verificação executada

- Vermelho antes da implementação: os casos de cidades independentes, combinação das listas,
  dimensões múltiplas e normalização do cache falharam como esperado. A validação de faixa já era
  atendida pelo parâmetro escalar anterior e foi preservada na conversão para listas.
- Backend: `466 passed, 1 skipped`; `ruff check` e `ruff format --check` verdes.
- Frontend: `564 passed` (75 arquivos); lint sem erros, typecheck e build verdes.
- Playwright contra a stack real: 2 cenários do Market Flip verdes, incluindo Martlock → Caerleon
  com T4 + T5 e resposta 200 usando os parâmetros repetidos.

### Validação humana restante

- Conferir a aparência dos chips no navegador de uso normal. A sessão automatizada direta estava
  deslogada; a interação funcional foi coberta no Chromium isolado do Playwright.
