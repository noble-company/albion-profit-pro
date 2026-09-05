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

## Estado da implementação

**Concluída.** Frontend: `npm run typecheck` limpo · `npm run lint` 0 erros (4 warnings
pré-existentes) · `npm run test` **133/133 em 29 arquivos** (+29) · `npm run build` passa.
Backend não foi tocado (task só de frontend).

### Decisão de produto — `profit_only` ligado nas três telas

Divergia sem ninguém ter decidido: Market Flip lia `profit_only === 'true'` (desligado por
padrão), Refino/Craft liam `!== 'false'` (ligado). **Unificado em ligado** (`OPPORTUNITY_DEFAULTS.profitOnly = true`):
consistente com a ordenação padrão `profit_desc` e com o propósito do produto (scanner de
lucro). Efeito: só o Market Flip muda — passa a esconder oportunidade negativa até o usuário
desmarcar "Apenas com lucro". O flag em si (piso de `min_profit` em `'0'`) já funcionava igual
nos dois `service.ts`; só o default de leitura da URL mudou.

### Arquivos novos — `src/components/opportunities/`

| Arquivo | O que é |
|---|---|
| `KpiCard.tsx` | cartão de indicador do cabeçalho; `tone` semântico (task 12) |
| `FilterPanel.tsx` | `FilterPanel` (casca + "Limpar filtros"), `FilterFieldset`, `FilterSelect`, `FilterSortSelect`, `FilterNumber`, `FilterToggle` + as consts `fieldLabel`/`fieldControl` |
| `OpportunityTable.tsx` | casca da tabela + API de `OpportunityColumn[]` (`cell: (row: OpportunityOut) => ReactNode` — tipado do OpenAPI, item 4) |
| `Pagination.tsx` | "Anterior / Página N / Próxima"; `onOffsetChange` só mexe no `offset` |
| `WarningBadges.tsx` | lista de avisos sobre `src/design/confidence.ts` (vocabulário da task 14) |
| `DetailDrawer.tsx` | gaveta de análise (movida de `production-pages.tsx`, com `DetailResult`/`Line`) |

Mais: `src/opportunities/useOpportunityParams.ts` (sincronia URL↔estado, defaults num lugar só)
e `src/opportunities/labels.ts` (`MODE_LABELS`).

### Arquivos reescritos

- `src/opportunities/pages.tsx` (656 → ~380 ln) e `src/opportunities/production-pages.tsx`
  (869 → ~470 ln): consomem os componentes compartilhados; `Kpi`/`Toggle`/`Select`/`updateParam`
  locais apagados; a tabela vira uma lista de `OpportunityColumn`. `CategorySelect` (só Flip,
  usa `traduzirCategoria`) e `toggleCity`/`percentageToRate`/`formatQuantity` continuam locais.

### Desvios da spec

- **Item 5 (não mudar comportamento além dos defaults) — uma exceção: a paginação estava
  morta.** O `updateParam` compartilhado fazia `next.delete('offset')` em **toda** escrita,
  inclusive quando o próprio botão de paginação chamava `updateParam(params, 'offset', …)` —
  o `set` era seguido do `delete`, então "Próxima"/"Anterior" removiam o `offset` da URL e a
  tela nunca saía da página 1. Nenhum teste cobria isso (os testes de paginação existentes
  batem no `service.ts` direto). O `useOpportunityParams` separa `setFilter` (muda filtro →
  volta pra página 1) de `setOffset` (pagina preservando o resto), o que conserta o bug. É
  mudança de comportamento, mas construir o hook que centraliza exatamente isso e deixar a
  paginação quebrada de propósito não fazia sentido. Registrado como `W12`.
- `WarningBadges` usa o `ConfidenceBadge` da task 14 (pílula com ícone + cor por nível) no
  lugar das pílulas planas `bg-primary/10` que a tabela de produção tinha, e no lugar do
  texto `.join(' · ')` que os cenários do drawer tinham. Mudança visual pequena, mas é o que
  "aplicando o vocabulário de confiança da task 14" pede (item 1) e o próprio
  `ConfidenceBadge.tsx` já anotava que `WarningBadges` sairia "sobre este vocabulário".
- Criado `.claude/launch.json` (config `frontend` → `npm run dev`, porta 5173) pra permitir o
  preview no navegador desta e das próximas tasks de UI.

### Testes automatizados — os 4 bullets

1. *Render + interação de cada componente* → `KpiCard.test.tsx`, `FilterPanel.test.tsx`,
   `OpportunityTable.test.tsx`, `Pagination.test.tsx`, `WarningBadges.test.tsx`.
2. *Defaults idênticos entre as telas* → `useOpportunityParams.test.tsx` ("o default de
   profit_only é o mesmo para qualquer schema de tela").
3. *Round-trip URL reversível* → `useOpportunityParams.test.tsx` ("ler os params da URL é
   reversível").
4. *Nenhuma duplicata de `Kpi`/`Checkbox`/`Select`/`updateParam`* →
   `src/test/no-duplicate-opportunity-primitives.test.ts`.

Os testes que já existiam (`opportunities.test.ts`, `production-pages.test.tsx`) passam sem
alteração — a extração preservou o comportamento.

### Testes manuais que já rodei

- `npm run dev` sobe sem erro de transform; o shell do app monta sem erro no console. A
  caminhada pelas telas de oportunidade em si precisa de backend + login (abaixo).

### Pendente pra você testar

Com backend + worker `maintenance` + login:

1. **Market Flip, Refino, Craft**: painel de filtros, KPIs, tabela e estado vazio renderizam
   como antes.
2. **Paginação (corrigida)**: numa busca com mais de 25 resultados, "Próxima" avança de
   página de verdade e o `offset` aparece na URL; mudar qualquer filtro volta pra página 1.
3. **`profit_only`**: no Market Flip, sem tocar em nada, oportunidades negativas **não**
   aparecem (antes apareciam); desmarcar "Apenas com lucro" traz de volta.
4. **Avisos**: as pílulas de aviso (ex.: "Ordem não garantida") aparecem com ícone e cor por
   nível de confiança, iguais nas três telas e no drawer de análise.
5. **URL compartilhável**: abrir uma URL com filtros aplicados em outra aba restaura o estado
   idêntico.
