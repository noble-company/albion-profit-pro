# 19 — Fonte única de localizações e categorias

> Corrige `F06`.

## Objetivo

Fazer o nome de uma cidade vir de um lugar só — o banco — em vez de três mapas hardcoded que já
discordam entre si.

## Por que

Existem hoje quatro autoridades sobre o nome de uma cidade, e elas não concordam:

| Fonte | Lymhurst | Covil |
|---|---|---|
| `lib/formatters.ts` (`LOCATION_LABELS`) | `1002` **e** `1301` | "Covil do Inferno" |
| `opportunities/pages.tsx` (`cities`) | `1002` + `1301` agrupados | ausente |
| `prices/pages.tsx` (`LOCATION_LABELS`) | somente `1301` | "Hell Den" |
| Tabela `location` no Postgres | autoridade real | autoridade real |

O endpoint `GET /locations` existe, devolve `location_id`, `name`, `display_name`, `kind` e
`is_royal_city`, e é usado por apenas parte das telas. Pior detalhe: `formatarLocalidade`
devolve o literal **"Mercado"** para qualquer ID que não esteja no seu mapa — a UI inventa um
nome em vez de mostrar o identificador real, escondendo do usuário e de nós que apareceu uma
localização desconhecida.

Há ainda a migration `f2d7e8f9a0b1_corrigir_id_de_lymhurst`, indicando que esse ID já foi
problema uma vez; manter cópias no cliente garante que volte a ser.

## O que implementar

1. Carregar localizações e categorias uma vez, via TanStack Query com `staleTime` de catálogo
   (`queryPolicies.catalog`), compartilhado por todas as telas.
2. Apagar `LOCATION_LABELS` de `formatters.ts` e de `prices/pages.tsx`, e a constante `cities`
   de `opportunities/pages.tsx`.
3. Fallback honesto: ID desconhecido exibe o próprio ID, nunca um nome inventado. Se agrupar
   mercados (o caso Lymhurst `1002`/`1301`) fizer sentido, o agrupamento vem do backend — como
   atributo da tabela `location` — e não de uma lista no componente.
4. Tratar `formatarCategoria`: hoje é um dicionário de ~40 traduções no cliente. Decidir se a
   tradução de categoria pertence ao backend (junto do catálogo) ou a um arquivo de i18n
   próprio; o que não pode é continuar espalhada em `formatters.ts` junto de lógica de formato.
5. Renomear `formatarNomeJogador` — ela formata **nome de item**, não de jogador (`F11`).
6. Garantir que a curadoria de `Location.name` no backend cubra as cidades reais, já que a UI
   passa a depender dela (`list_eligible_craft_locations` já filtra por `name IS NOT NULL`).

## Depende de

Task 15.

## Testes automatizados

- Nenhum mapa de `location_id` para nome permanece em `src/`.
- ID desconhecido é renderizado como o próprio ID, não como "Mercado".
- Todas as telas exibem o mesmo rótulo para a mesma cidade (teste comparando as telas).
- `/locations` é requisitado uma vez por sessão, mesmo com três telas visitadas.

## Testes manuais

Percorrer Market Flip, Refino, Craft, Preços e Calculadora conferindo que Lymhurst e o Black
Market aparecem com o mesmo nome em todas.

## Estado da implementação

**Concluída.** Backend: `uv run pytest tests/ -q` → **342 passed** (+1) · `uv run ruff check .`
limpo. Frontend: `npm run typecheck` limpo · `npm run lint` 0 erros (4 warnings
pré-existentes) · `npm run test` **104/104 em 22 arquivos** (+7) · `npm run build` passa.

### Fonte única

O nome de uma cidade vem de `GET /locations` (hook `useLocations`, política `queryPolicies.catalog`,
deduplicado pelo TanStack Query — item 1 já estava pronto da task 15). Novo `frontend/src/lib/locations.ts`:

- `useLocationName()` — devolve uma função de lookup `location_id → nome`. Usa `display_name`
  do backend, que já é `name || location_id`. **Fallback honesto:** ID fora do catálogo mostra
  o próprio ID; `null`/`undefined` viram `—`. Nunca o literal "Mercado".
- `useMarketToggles()` — cidades para os botões do Market Flip, agrupadas por `display_name`.
  O caso Lymhurst (`1002` mercado + `1301` cluster do portal) tem os dois IDs com o mesmo
  `name` no banco, então o agrupamento vem do dado, não de uma lista no componente.

### Arquivos

**Novos:** `frontend/src/lib/locations.ts`, `frontend/src/i18n/categories.ts` (tradução de
categoria movida verbatim de `formatters.ts`), `frontend/src/lib/locations.test.tsx`,
`frontend/src/test/no-hardcoded-location-map.test.ts`.

**Alterados:**
- `frontend/src/lib/formatters.ts` — removidos `LOCATION_LABELS`, `formatarLocalidade`,
  `CATEGORY_LABELS`, `formatarCategoria`. `formatarNomeJogador` → `formatarNomeItem` (item 5,
  `F11` — ela formata nome de item, não de jogador).
- `frontend/src/opportunities/pages.tsx` — apagada a constante `cities`; usa `useMarketToggles`
  e `useLocationName`; `formatarCategoria` → `traduzirCategoria`.
- `frontend/src/opportunities/production-pages.tsx`, `frontend/src/prices/pages.tsx`,
  `frontend/src/craft/pages.tsx` — `LOCATION_LABELS`/`locationLabel` apagados; toda exibição
  de nome de cidade passa por `useLocationName`.
- `backend/tests/items/test_import_locations.py` — novo teste: todo ID em
  `confirmed_market_ids` do manifesto resolve para `name` não-nulo (a UI agora depende disso —
  item 6). A curadoria em `scripts/import_locations.py` já falhava fechado (`ValueError`) para
  ID confirmado sem nome no `world.json`; o teste tranca isso contra o manifesto real.

### Decisão: tradução de categoria vai para i18n no cliente, não para o backend (item 4)

O contrato HTTP é inglês-only (task 07) — a API devolve o slug cru (`shop_category` etc.). Pôr
tradução pt-BR no backend violaria isso. Então `traduzirCategoria` foi para
`frontend/src/i18n/categories.ts`, separada da lógica de formato de número que a rodeava em
`formatters.ts`. O dicionário (~40 entradas) foi movido sem alteração.

### Testes automatizados — os 4 bullets da spec

1. *Nenhum mapa `location_id → nome` em `src/`* → `no-hardcoded-location-map.test.ts` varre
   `src/**/*.{ts,tsx}` (menos testes) por objetos literais com ≥2 chaves no formato de ID de
   localização, e proíbe os identificadores `formatarLocalidade`/`formatarNomeJogador`/
   `formatarCategoria` de voltarem.
2. *ID desconhecido rende o próprio ID, não "Mercado"* → `locations.test.tsx`.
3. *Todas as telas exibem o mesmo rótulo para a mesma cidade* → `locations.test.tsx` (duas
   instâncias de `useLocationName` devolvem o mesmo nome; combinado com o guard do bullet 1,
   que garante que nenhuma tela tem mapa próprio).
4. *`/locations` é requisitado uma vez por sessão* → já coberto por
   `tanstack-query-behavior.test.tsx` ("duas telas que pedem /locations disparam uma única
   requisição"), da task 15.

### Desvios da spec

- Item 3 fala em "agrupamento como atributo da tabela `location`". A tabela não tem uma coluna
  de grupo, mas Lymhurst `1002` e `1301` já têm o **mesmo `name`** no banco (curado em
  `import_locations.py`), então `useMarketToggles` agrupa por `display_name` — o agrupamento
  vem do dado do backend, que era o requisito real. Nenhuma migração nova.
- `craft/pages.tsx` e `production-pages.tsx` ainda chamam `useLocations()` diretamente para
  **popular o `<select>` de cidade** (lista de opções), mas a **exibição do nome** passa por
  `useLocationName`. Não é mapa hardcoded — é a mesma fonte única.

### Testes manuais que já rodei

- `no-hardcoded-location-map.test.ts` confirma que `LOCATION_LABELS` sumiu dos 3 arquivos.
- Backend: `SPECIAL_MARKETS` cobre `1301`/`3003`; o novo teste passa contra o manifesto real
  (`albion-static-2026-08-23.json`, 9 `confirmed_market_ids`).

### Pendente pra você testar

Subir o frontend (`npm run dev`) com o backend e o worker `maintenance` rodando e percorrer
**Market Flip → Refino → Craft → Preços → Calculadora**, conferindo que:

1. Lymhurst aparece com o mesmo nome ("Lymhurst") nas 5 telas — inclusive no toggle do Market
   Flip, que agora agrupa os dois IDs.
2. O Black Market aparece nas telas onde há linha com `location_id = 3003` (Preços, Flip) com o
   nome "Black Market" — não "Hell Den" nem "Covil do Inferno".
3. Se alguma linha vier com um `location_id` que não está em `/locations`, a tela mostra **o
   código**, não "Mercado".
