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
