# 21 — Tela Market Flip

## Objetivo

Reconstruir a tela principal do produto sobre a fundação das tasks 11-20, entregando a promessa
"compre barato numa cidade, venda caro em outra" de forma legível em segundos.

## Por que

A tela atual funciona, mas foi escrita antes de existir design system e antes de os motores
serem corrigidos. Ela carrega: componentes duplicados (`F05`), ordenação que mente (`F08`),
aritmética em `number` (`F09`), três estilos de estado vazio, filtros num painel de 200 linhas
com três `fieldset` e nenhum ícone.

Com as tasks 02, 04, 17 e 18 concluídas, boa parte da complexidade dela deixa de existir: a
coluna "Taxas" vem pronta da API, a ordenação é do servidor, e o cálculo sai do componente.

## O que implementar

1. Reconstruir `MarketFlipPage` usando exclusivamente os componentes da task 20 e a linguagem
   visual da task 14.
2. Aplicar a hierarquia definida: lucro e ROI dominantes, rota (cidade de compra → cidade de
   venda) imediatamente legível, custos e taxas como informação secundária.
3. Consumir os campos novos do contrato (task 04): `gross_revenue`, `sales_tax`, `setup_fee`,
   `net_revenue` — sem nenhuma conta no componente.
4. Comunicar confiança de forma explícita: `dado_velho`, cobertura parcial e quantidade
   executável precisam ficar visíveis, não escondidos num badge cinza. Este é o diferencial
   honesto do produto e hoje está subcomunicado.
5. Manter as mensagens de estado vazio que já estão certas ("A ausência de dados não representa
   lucro zero") e padronizá-las conforme a task 14.
6. Preservar a sincronia de filtros com a URL, para que uma oportunidade possa ser compartilhada
   por link.
7. Indicador de atualização honesto: o selo "Atualização automática · 30s" só pode aparecer se o
   polling estiver de fato ativo (aba visível, conforme task 15).

## Depende de

Tasks 02, 04, 17, 18, 19 e 20.

## Testes automatizados

- Render com dados devolvidos por MSW no formato do contrato novo.
- Filtro alterado mantém a tabela anterior visível (sem piscar) e atualiza a URL.
- Estados de carregando, vazio e erro renderizam o padrão da task 14.
- Nenhuma operação aritmética sobre campo monetário no componente (verificado por lint).
- Avisos de confiança aparecem quando o payload os traz.

## Testes manuais

Com backend real e dados coletados em jogo, confirmar que a primeira tela responde "o que eu
faço agora para lucrar" em menos de cinco segundos de leitura. Testar em 1366×768 e no celular.

## Estado da implementação

**Concluída.** Frontend: `npm run typecheck` limpo · `npm run lint` 0 erros (4 warnings
pré-existentes) · `npm run test` **144/144 em 31 arquivos** (+11) · `npm run build` passa.
Backend não foi tocado.

### O que mudou

- **`OpportunityTable` ganhou a densidade da §1** (afeta as três telas de oportunidade): linha
  `h-11`, célula `px-3 py-2` (fim do `p-4`), número à direita com `tabular-nums`, texto à
  esquerda — via campos novos `numeric` / `weight` na `OpportunityColumn`. Cabeçalho
  `sticky top-0` opaco. Scroll (vertical + horizontal) contido no card (`max-h-[70vh]
  overflow-auto`), com `border-separate` pra `position: sticky` funcionar nas células.
  `minWidth` configurável por tela.
- **Colunas grudam na borda** (`sticky: 'left' | 'right'` + `width`): no Market Flip a coluna
  **Item** gruda à esquerda e **Lucro/ROI** à direita durante o scroll horizontal do mobile.
  A tabela calcula o deslocamento de colunas grudadas empilhadas (`calc(...)` das larguras).
- **`TabelaCarregando` virou o estado de carregando da tabela** — movido de `src/design/`
  para `src/components/opportunities/`; `OpportunityTable` aceita `loading` e mostra o skeleton
  no formato da tabela (§3), não um spinner.
- **Estado vazio padronizado**: o `<div>` desenhado à mão saiu; agora é `EstadoVazio`
  (`components/ui/states.tsx`) com ícone `ArrowLeftRight`, mantendo a frase "A ausência de
  dados não representa lucro zero" (§5).
- **Selo "Atualização automática · 30s" honesto (item 7)**: novo hook `usePageVisible()`
  (`useSyncExternalStore` em `visibilitychange`). O selo só aparece com a aba visível — que é
  quando o `refetchInterval` de fato roda (`refetchIntervalInBackground: false`).
- **Colunas do Market Flip re-hierarquizadas (§2)**: Item (com qualidade + avisos abaixo),
  **Rota** nova (`cidade-compra → cidade-venda`, ícone `ArrowLeftRight`), Compra unit., Venda
  unit., Qtd., Investimento, Faturamento, Taxas (contexto), Lucro, ROI. **Todas as colunas de
  dinheiro ficam visíveis** (decisão do usuário) — dá pra reconciliar
  `faturamento − taxas − investimento = lucro` linha a linha e conferir o cálculo do servidor.
- **Avisos de confiança agora aparecem no Market Flip** (`WarningBadges` sob o nome do item) —
  antes só a tela de produção mostrava.

### Arquivos

**Novos:** `src/lib/usePageVisible.ts`, `src/lib/usePageVisible.test.tsx`,
`src/opportunities/pages.test.tsx` (não existia teste de componente do Market Flip).
**Movido:** `src/design/TabelaCarregando.tsx` → `src/components/opportunities/TabelaCarregando.tsx`
(o import em `LinguagemVisualPage.tsx` acompanhou; comentário do `ConfidenceBadge.tsx`
atualizado).
**Alterados:** `src/components/opportunities/OpportunityTable.tsx` (densidade + sticky +
loading), `src/opportunities/pages.tsx` (colunas + estados + selo), `src/opportunities/production-pages.tsx`
(colunas migradas pro `numeric`/`className` — polimento visual completo fica pra task 22).

### Desvios da spec

- §1 pede as 3 colunas de meio-segundo (item, lucro, ROI) `sticky left-0` no mobile. Não dá
  pra grudar em bordas opostas num scroll horizontal: **Item gruda à esquerda, Lucro/ROI à
  direita** (decisão do usuário: "pode grudar, vamos ver como fica").
- `formatarSilver` sempre acrescenta " silver" — nas células da tabela isso se repete 6× por
  linha. Mantido por ora (consistência; `tabular-nums` ainda alinha os dígitos). Se pesar
  visualmente, uma variante sem unidade entra numa task de polimento (22/24).
- `production-pages.tsx` herdou a densidade nova mas **não** foi redesenhada — é a task 22.
  Continua com estados de carregando/vazio próprios.

### Testes automatizados — os 5 bullets

`src/opportunities/pages.test.tsx`: (1) render no contrato novo com rota + colunas de
reconciliação; (2) filtro trocado mantém a linha anterior visível (`keepPreviousData`) e envia
o filtro ao servidor; (3) vazio no padrão da task 14; (4) erro mostra o cartão, não tabela
vazia; (5) avisos de confiança quando o payload traz. Mais: selo só com aba visível.
`OpportunityTable.test.tsx` ganhou testes de `numeric`/`tabular-nums`, sticky + deslocamento,
densidade `h-11`/`px-3` e o skeleton de loading. `usePageVisible.test.tsx` cobre o hook.
Nenhuma aritmética monetária no componente — a regra de lint `no-restricted-syntax` (F09) já
cobre e continua verde. Os testes que já existiam passam sem alteração.

### Testes manuais que já rodei

`npm run dev` sobe sem erro de transform/console no shell. A caminhada real precisa de backend
+ login (a validação de sessão fica em "Carregando sessão…" sem o backend).

### Pendente pra você testar

Com backend + worker + login, no Market Flip:

1. A tabela cabe ~15 linhas numa tela de laptop sem espremer; rolar não passa texto por baixo
   do cabeçalho.
2. **1366×768 e celular**: o card não empurra a página pro lado; ao rolar a tabela na
   horizontal, Item fica preso à esquerda e Lucro/ROI à direita.
3. Em <5s de leitura dá pra responder "o que faço agora pra lucrar" — Item, Rota, Lucro e ROI
   saltam; taxas/investimento são secundários.
4. **Reconciliação**: numa linha, `Faturamento − Taxas − Investimento` bate com `Lucro`
   (lembrando do `W5`: com "Pedido de compra" ligado a `acquisition_setup_fee` conta em dois
   lugares e não fecha — isso é conhecido).
5. Trocar um filtro não pisca a tabela (linha anterior fica até a nova resposta).
6. Minimizar a aba / trocar de aba → o selo "Atualização automática" some; voltar → reaparece.
7. Estados vazio/erro/carregando seguem o visual da task 14.
