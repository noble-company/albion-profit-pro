# 22 — Telas de Refino e Craft unificadas

## Objetivo

Substituir as duas telas de produção por **uma** tela parametrizada, servida pelo ranking
materializado da task 03.

## Por que

`production-pages.tsx` já é uma tela só: `ProductionRankingPage` recebe um `config` e é
instanciada duas vezes (`RefiningRankingPage`, `CraftingRankingPage`). A estrutura está certa —
o que está errado é que ela carrega 862 linhas com todos os componentes duplicados do flip
(`F05`) e depende de um ranking silenciosamente truncado nas 200 primeiras receitas em ordem
alfabética (`B02`).

Com a task 03, a tela passa a mostrar o ranking real. Com a task 20, some a duplicação. Sobra a
parte que interessa: apresentar bem "o que vale a pena produzir agora".

## O que implementar

1. Reconstruir sobre os componentes da task 20, mantendo a parametrização por tipo de produção
   e usando a classificação da task 09 em vez da heurística de substring.
2. Exibir a **cobertura do ranking** que a task 03 passa a devolver: quantas receitas foram
   avaliadas e quando o ranking foi calculado. O usuário precisa saber que está vendo o universo
   completo — e, quando não estiver, precisa ser avisado.
3. Apresentar ingredientes e retorno esperado de forma legível. Hoje são duas colunas de
   `<div>` empilhados sem estrutura, e o retorno é recalculado no componente com `Number()`.
4. Manter o drawer de análise detalhada, que continua chamando `POST /craft/simulate` sob
   demanda — é o caminho correto e não muda.
5. Corrigir o `openDetail` atual, que envia `scope: 'all'` fixo e `quality_level ?? 1` sem
   refletir o filtro ativo da tela.
6. Consolidar as rotas `/refino` e `/craft` com a mesma tela e estado compartilhado de filtros.

## Depende de

Tasks 03, 04, 09, 17, 18, 19 e 20.

## Testes automatizados

- Uma receita fora das 200 primeiras em ordem alfabética aparece no ranking (regressão de `B02`
  verificada pela UI, não só pela API).
- A cobertura do ranking é exibida quando o payload a traz.
- Abrir o detalhe envia os parâmetros ativos da tela, não valores fixos.
- Trocar entre refino e craft preserva os filtros que fazem sentido nos dois.
- Nenhum cálculo monetário no componente.

## Testes manuais

Comparar um refino conhecido (por exemplo, fibra T4) com o valor calculado à mão no jogo,
conferindo custo, retorno e lucro.

## Estado da implementação

**Concluída.** Frontend: `npm run typecheck` limpo · `npm run lint` 0 erros (4 warnings
pré-existentes) · `npm run test` **150/150 em 32 arquivos** (+6) · `npm run build` passa.
Backend não foi tocado.

### O que mudou

- **Toggle Refino/Craft na tela (item 6)** — `KindToggle` renderiza dois `role="tab"` como
  `<Link>` que carregam `location.search`. Trocar de tipo preserva tier, qualidade, retorno,
  estação etc. Os `NavLink` do `AppShell` ainda perdem params — é da task 24.
- **`RankingCoverage` — componente próprio (item 2, corrige `B02`/`W6`)** — mostra
  `priced / evaluated de total`, `recalculado há N`, e o aviso fixo **"Valores da lista são
  estimativa — abra 'Analisar' para o cálculo exato"** (`price_model="neutral_ranking"` +
  `return_rate` linear). Tom `warning` quando `stale`.
- **Coluna "Receita" (item 3)** — junta ingredientes e retorno esperado numa lista compacta:
  `Fibra T4 ×2 · retorno 0,7`. A coluna "Retorno" separada — que ficava sempre em `—` porque
  o `recipe_ranking.ingredients` grava `expected_return_quantity: "0"` (`W4`) — sumiu; o
  retorno só aparece quando é positivo, e o detalhe exato está no "Analisar".
- **`formatQuantity` decimal (item 3)** — novo em `lib/money.ts`. O `formatQuantity` local que
  fazia `Number(expected_return_quantity)` saiu — quantidade também não passa por `number` (F09).
- **`openDetail` corrigido (item 5)** — `output_quality` passa a ser
  `query.quality ?? row.quality_level ?? 1` (reflete o filtro da tela). `scope` fica `'all'`
  (o ranking materializado é global, sem filtro mine/all — decisão do usuário).
- **Estados padronizados (task 14)** — `EstadoVazio` no lugar do `<div>` à mão; skeleton no
  formato da tabela via `OpportunityTable loading`; selo "Atualização automática" gated por
  `usePageVisible()` — igual ao Market Flip.
- **Frescor capado em 6h (`W7`)** — as opções eram `1/2/6/12/24`, mas `max_age_hours` na
  leitura do ranking só **aperta** a janela de 6h do rebuild; 12h/24h não faziam efeito. Agora
  são `1/2/6`.
- Coluna "Detalhes" também gruda à direita (`sticky`), pra o botão "Analisar" nunca sumir sob
  Lucro/ROI no scroll horizontal.

### Arquivos

**Novos:** `src/components/opportunities/RankingCoverage.tsx` (+teste). **Alterados:**
`src/opportunities/production-pages.tsx` (reescrito), `src/opportunities/production-pages.test.tsx`
(+4 casos), `src/lib/money.ts` (+`formatQuantity`, +teste).

### Desvios da spec

- Item 1 fala em "uma tela parametrizada" — já era (`ProductionRankingPage` + `config`). As
  rotas `/refino` e `/craft` continuam separadas no `App.tsx`; a unificação de estado veio
  pelo `KindToggle` que carrega a URL, não por fundir as rotas.
- `scope: 'all'` mantido (sem seletor de escopo no ranking) — confirmado com o usuário.

### Testes automatizados — os 5 bullets

`production-pages.test.tsx`: (1) receita "Zinco" (fim do alfabeto) ordenada por lucro aparece
em primeiro — regressão `B02` pela UI; (2) `RankingCoverage` exibida quando o payload traz;
(3) "Analisar" com qualidade 5 no filtro envia `output_quality: 5`; (4) trocar pra Craft com
`tier=6` no filtro → a aba Craft aponta pra `/craft?...tier=6`. `RankingCoverage.test.tsx`
cobre a razão + aviso de estimativa + tom `stale`. `money.test.ts` cobre `formatQuantity`.
Regra de lint F09 (`no-restricted-syntax`) continua verde — nenhum `Number()` sobre campo
monetário/quantidade no componente. Os testes que já existiam passam (o de ingredientes foi
ajustado pro markup novo da coluna "Receita").

### Testes manuais que já rodei

`npm run dev` compila sem erro; shell monta sem erro no console.

### Pendente pra você testar

Com backend + worker `maintenance` rodando + login, em `/refino` e `/craft`:

1. **`B02`**: um refino/craft lucrativo com nome no fim do alfabeto (ex.: algo com "Z")
   aparece no topo se for o mais lucrativo — não some por causa de truncamento alfabético.
2. A barra de cobertura mostra números plausíveis (~110 refining / ~5.5k crafting no total) e
   "recalculado há Xmin"; deixar o beat parado por >10min → vira "desatualizado" em `warning`.
3. **Comparar fibra T4** (ou outro refino conhecido) com o cálculo à mão no jogo: custo dos
   recursos, retorno esperado, lucro. O número da **lista** é aproximado; o "Analisar" tem que
   bater com a conta manual.
4. Toggle Refino↔Craft com filtros aplicados: os filtros seguem.
5. "Analisar" com um filtro de qualidade ativo abre o cenário na qualidade certa.
6. Frescor só oferece 1/2/6h.
7. Estados vazio/erro/carregando no visual da task 14; selo some com a aba oculta.
