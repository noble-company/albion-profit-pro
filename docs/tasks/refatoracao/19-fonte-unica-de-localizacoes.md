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
