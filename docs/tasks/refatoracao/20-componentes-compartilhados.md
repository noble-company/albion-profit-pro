# 20 — Componentes compartilhados de oportunidade

> Corrige `F05`. Abre o bloco de reconstrução das telas.

## Objetivo

Extrair, uma vez só, os componentes que as telas de oportunidade compartilham — antes de
reconstruir qualquer uma delas.

## Por que

`opportunities/pages.tsx` (699 linhas) e `opportunities/production-pages.tsx` (862 linhas) têm
`Kpi`, `Checkbox`, `Select` e `updateParam` **copiados byte a byte**. São 1.561 linhas fazendo
essencialmente a mesma coisa: cabeçalho com KPIs, painel de filtros em `fieldset`, tabela densa,
paginação e estado vazio.

E a cópia já divergiu em comportamento: o default de `profitOnly` é
`params.get('profit_only') === 'true'` no flip (desligado por padrão) e
`params.get('profit_only') !== 'false'` na produção (ligado por padrão). O mesmo checkbox, com o
mesmo rótulo, tem default oposto em duas telas do mesmo produto — e ninguém decidiu isso.

Reconstruir as telas sem extrair primeiro significa copiar e colar de novo, agora com
componentes bonitos.

## O que implementar

1. Extrair para `src/components/` sobre os primitivos da task 11:
   - `KpiCard` (com os tokens semânticos da task 12, não com `tone: 'amber' | 'emerald' | 'sky'`);
   - `FilterPanel` e os campos (`FilterSelect`, `FilterToggle`, `FilterNumber`);
   - `OpportunityTable` parametrizada por definição de coluna;
   - `Pagination`;
   - `WarningBadges`, aplicando o vocabulário de confiança da task 14;
   - `DetailDrawer` (a acessibilidade vem na task 25).
2. Centralizar a sincronia com a URL: um hook só (`useQueryParams`) no lugar dos dois
   `updateParam` duplicados, com **um** conjunto de defaults declarado em um lugar.
3. **Decidir e unificar** o default de `profitOnly` e de qualquer outro parâmetro divergente.
   Registrar a decisão na task — é comportamento de produto, não detalhe de implementação.
4. Tipar as colunas a partir do schema OpenAPI, para que uma mudança de contrato quebre a
   compilação em vez de virar `undefined` em produção.
5. Não alterar comportamento nesta task além da unificação dos defaults: a reconstrução visual é
   das tasks 21-24.

## Depende de

Tasks 11, 12, 13, 14 e 15.

## Testes automatizados

- Cada componente extraído tem teste de render e de interação.
- Os defaults de filtro são idênticos entre as telas (teste comparando os dois usos).
- A leitura e a escrita de parâmetros na URL é reversível (ida e volta preserva o estado).
- Nenhuma definição duplicada de `Kpi`, `Checkbox`, `Select` ou `updateParam` permanece em `src/`.

## Testes manuais

Abrir uma URL com filtros aplicados em outra aba e confirmar que o estado é restaurado
exatamente igual.
