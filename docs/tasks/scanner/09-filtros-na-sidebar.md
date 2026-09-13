# 09 — Filtros na sidebar

> Corrige `X04` ("não consigo filtrar nada") e entrega o checkbox que inverte `X01`/`X02`.

## Objetivo

Todo filtro que o jogador precisa, na coluna da esquerda, respondendo **no mesmo frame** — e um
deles decidindo se receita sem preço aparece ou não.

## Por que

Duas queixas do usuário, uma delas literal:

> "Além disso, não consigo filtrar nada"
> "não quero que fique exibindo apenas os que tem preço, eu quero que apareça tudo, e que eu
> possa filtrar"

O que existe hoje (`src/opportunities/service.ts:102-138`) manda ao servidor: `location_id`,
`tier`, `enchantment_level`, `quality_level`, `max_age_hours`, `require_complete`,
`min_profit`, `min_roi`, `sort`. Cada um é um round-trip. E **não existe** filtro por peso, por
foco, por categoria, por texto, nem "mostre tudo".

Com o engine da task 05 calculando o conjunto inteiro no navegador, filtrar deixa de ser
consulta e vira predicado sobre um array em memória. Isso é o que torna "5.523 receitas com 8
filtros combinados" instantâneo.

## O que implementar

1. **`src/scanner/filters.ts`** — o modelo e o predicado, sem React:

   ```ts
   export interface ScannerFilters {
     search: string            // nome do item ou unique_name
     tiers: number[]           // vazio = todos
     enchantments: number[]
     category: string | null
     locations: string[]
     minProfit: string | null  // string decimal (F09)
     minRoi: string | null
     maxAgeHours: number | null
     showUnpriced: boolean     // ← padrão TRUE
     profitableOnly: boolean
   }
   export function applyFilters(rows, filters, itemsByName): ScannerRow[]
   ```

   **`showUnpriced` nasce `true`.** É a inversão explícita de `X01`/`X02`: o produto mostra
   tudo, e esconder passa a ser escolha do usuário num checkbox — nunca padrão do servidor.

2. **`maxAgeHours` filtra, não esconde por padrão.** Nasce `null` (sem limite). A idade é uma
   coluna que o usuário decide usar; a janela de 6 h do backend deixa de ser um recorte
   invisível.

3. **`src/scanner/useScannerFilters.ts`** — sincronia com a URL, no mesmo espírito de
   `useOpportunityParams` (que **fica**, servindo o Market Flip até a task 12). Filtro
   compartilhável por link e sobrevivendo ao F5.

4. **`src/components/filters/`** — primitivos verticais para a sidebar:
   `FilterSearch`, `FilterChips` (multi-seleção de tier/encantamento, que hoje não existe),
   `FilterRange`, `FilterCheckbox`, `FilterSelectField`.

   Substituem a família de `components/opportunities/FilterPanel.tsx`, desenhada para grade
   horizontal acima da tabela. **Eliminar as duas cópias manuais** de `fieldLabel`/`fieldControl`
   (`src/items/pages.tsx:8-11` e a de `prices/pages.tsx`), e estender
   `no-duplicate-opportunity-primitives.test.ts` para cobrir os primitivos novos.

5. **Os controles "e se"** (premium, retorno, estação, foco) continuam existindo e vão para a
   sidebar também, como seção própria — eles mudam o *valor* das linhas, não *quais* linhas
   existem, e a distinção precisa ficar visível.

## Bibliotecas/dependências

Nenhuma nova. `Checkbox` do shadcn já instalado.

## Depende de

Tasks **05** (o que se filtra) e **08** (onde os filtros moram).

## Testes automatizados

- **`showUnpriced` começa ligado**, e desligá-lo é o que esconde linha sem preço — nunca o
  contrário. É o teste que trava a inversão de `X01`/`X02`.
- Tier e encantamento aceitam **múltipla seleção**; vazio significa "todos", não "nenhum".
- Busca por texto casa nome em português, em inglês e `unique_name`.
- `minProfit`/`minRoi` comparam por `decimal.js`, não `Number` (`F09`) — e linha sem preço
  **não** é excluída por eles quando `showUnpliced` está ligado (o `NULL >= x` do servidor
  antigo era o `X02`).
- Filtro por idade máxima usa `oldestObservedAt`; `null` significa sem limite.
- Combinar 5 filtros sobre 5.523 linhas continua abaixo de um frame.
- A URL reflete os filtros e os restaura no reload.

## Testes manuais

Na task 11, com a tela montada: combinar filtros e confirmar que a tabela responde sem spinner
e sem requisição na aba de rede.

## Estado da implementação

**Concluída.** `npm run lint` 0 erros (5 warnings pré-existentes) · `typecheck` limpo ·
`npm run test` **253/253** (+21).

- **`src/scanner/filters.ts`** — `ScannerFilters`, `DEFAULT_FILTERS`, `applyFilters`. Sem React.
- **`src/scanner/useScannerFilters.ts`** — sincronia com a URL, incluindo os controles "e se".
- **`src/components/filters/index.tsx`** — primitivos verticais: `FilterSearch`, `FilterChips`
  (multi-seleção, que **não existia** no produto), `FilterNumberField`, `FilterSelectField`,
  `FilterCheckbox`, `FilterGroup`.
- **Duas cópias manuais removidas** — `items/pages.tsx` e `prices/pages.tsx` passaram a importar
  `filterLabel`/`filterControl` do módulo canônico.

### O número que justifica a arquitetura

| | |
|---|---|
| 5 filtros combinados sobre 5.523 linhas | **2,5 ms** |

Filtrar deixou de ser consulta e virou predicado sobre array em memória. É por isso que "5.523
receitas com 8 filtros" pode ser instantâneo.

### A inversão de `X01`/`X02`, travada por teste

`DEFAULT_FILTERS.showUnpriced` nasce `true`. Três testes cercam isso:

- receita sem preço **aparece** por padrão;
- desligar o checkbox é o que esconde;
- **`minProfit` não exclui linha sem preço** — no servidor antigo, `neutral_profit >= 0` era
  `NULL` para essas linhas e elas sumiam sem ninguém pedir. Ausência de preço não é lucro abaixo
  do mínimo, e agora o código diz isso explicitamente.

### O guard que estava verde testando nada

Ao estender `no-duplicate-opportunity-primitives.test.ts` com a regra das classes copiadas à
mão, o teste passou de primeira — e **não devia**, porque `items/pages.tsx` tinha a cópia bem
ali.

O `\b` da regex tinha virado um **byte backspace literal** (`0x08`) na passagem por heredoc de
shell. `cat -A` mostrou `^H` no lugar. A regex nunca casava, e o guard parecia verde enquanto
não testava coisa nenhuma.

Corrigido, ele imediatamente acusou as duas cópias (`items/pages.tsx`, `prices/pages.tsx`), que
foram removidas. Lição registrada: **guard novo que passa de primeira merece desconfiança** —
foi só porque eu esperava vê-lo vermelho que o defeito apareceu.

### Pendente pra você testar

Nada ainda — os filtros existem mas não estão numa tela. É a task 11 que os monta na sidebar e
liga na tabela.
