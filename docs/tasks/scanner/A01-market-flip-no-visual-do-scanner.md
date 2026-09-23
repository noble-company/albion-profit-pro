# A01 — Market Flip no visual do scanner

> Ajuste depois do fechamento da Fase 4 ([README](README.md#ajustes-depois-do-fechamento)). Não
> reabre a contagem da fase. Os filtros que pedem mudança no servidor ficam na
> [A02](A02-filtros-do-flip-no-servidor.md).

## Objetivo

O Market Flip passa a ter a cara das telas da Fase 4: filtros na barra da direita, tabela na altura
toda, ícone do item com o grau embaixo do nome, ordenação pelo cabeçalho, busca por nome e Tamanho
do conteúdo valendo para a tabela. **O cálculo não muda**: continua no servidor
(`flip_opportunities`, sobre o livro de ordens), paginado, com quantidade e investimento reais.

## Por que

É a última tela principal com o layout da Fase 3.5. Conferido no código, 2026-09-13:

| # | O que a tela faz | Evidência |
|---|---|---|
| 1 | Cabeçalho de apresentação ("Encontre o próximo lucro") e três cartões de KPI antes de qualquer dado | `frontend/src/opportunities/pages.tsx:184-228` |
| 2 | Três blocos de filtro empilhados **acima** da tabela — o `X05` da fase, que Refino e Craft já corrigiram: a tabela nasce abaixo da dobra | `pages.tsx:229-396` |
| 3 | Tabela em cartão com título e `max-h-[70vh]`: não ocupa a altura disponível | `components/opportunities/OpportunityTable.tsx:95,112` |
| 4 | Larguras em rem fixo (`13rem`, `11rem`, `minWidth="72rem"`): com o Tamanho em 220% o texto cresce e a coluna não — a §6 do [doc 13](../../13-linguagem-visual.md) proíbe rem fixo no centro | `pages.tsx:98,117,415` |
| 5 | Item sem ícone, com o nome numa linha e a qualidade embaixo; o scanner mostra ícone, nome em até 2 linhas e grau embaixo | `pages.tsx:95-114` × `scanner/columns.tsx:70-87` |
| 6 | "Lucro na página" soma só as 25 linhas da página, e "Última observação" lê só a primeira linha — dois números que parecem do mercado inteiro | `pages.tsx:76-78,209-227` |
| 7 | Ordenação num seletor separado da tabela; nas telas novas é o próprio cabeçalho | `pages.tsx:324-328` |
| 8 | Sem busca por nome — embora o servidor já busque: `item_id` procura o texto no nome normalizado, com índice trigram. A tela nunca manda o parâmetro | `backend/src/opportunities/service.py:20-25`; `pages.tsx:39-48` |
| 9 | A tela sem servidor manda escolher "no menu superior", que não existe desde a task 08 | `pages.tsx:441` |

## Decisões com o usuário (2026-09-13)

| # | Decisão |
|---|---|
| 1 | **Caminho A: só o visual.** O cálculo segue no servidor sobre `market_order` — quantidade disponível, investimento e o livro do nosso client. Levar o Flip para o modelo do scanner (`price_snapshot` + cálculo no navegador) fica fora: o snapshot não guarda quantidade, e o preço da API pública costuma ter horas, o que engana em flip. |
| 2 | **Ajuste depois do fechamento**, com código `A01`, sem reabrir a contagem da Fase 4. |
| 3 | **O que muda o servidor vai para a A02**: Comprar em e Vender em separados; tier, encantamento e qualidade com vários valores. |

## O que implementar

### 1. Filtros na barra da direita

`<SidebarSection title="Filtros">` com os primitivos de `components/filters` — os mesmos de
Refino/Craft. Cada controle corresponde a um parâmetro que `GET /opportunities/flips` já aceita;
**nenhum filtro novo no servidor.**

| Grupo | Controles | Parâmetro |
|---|---|---|
| — | Busca por nome (`FilterSearch`), a partir de 3 letras (`MIN_LETRAS_DA_BUSCA`) | `item_id` |
| O que analisar | Categoria → Subcategoria → Tipo, em cascata (`FilterSelectField`), de `useCategories` | `category`, `subcategory`, `subcategory2` |
| Item | Tier, Encantamento e Qualidade (`FilterSelectField`, **um valor** — o servidor aceita um só até a A02) | `tier`, `enchantment_level`, `quality_level` |
| Mercado | Cidades (`FilterChips`, várias), de `useMarketToggles` | `location_id` |
| Resultado | Lucro mínimo e ROI mínimo (`FilterNumberField`); Frescor máximo (1/2/6/12/24 h, padrão 6); Apenas com lucro; Cobertura completa (`FilterCheckbox`) | `min_profit`, `min_roi`, `max_age_hours`, `profit_only`, `require_complete` |
| Estratégia | Conta Premium, Pedido de compra, Pedido de venda (`FilterCheckbox`, com a taxa na descrição) | `premium`, `buy_order`, `sell_order` |
| — | Limpar filtros | — |

A URL continua sendo a fonte (`useOpportunityParams`, que fica): link compartilhável, F5 preserva.
O texto de "Cidades" diz o que o filtro faz de verdade: **as duas pontas da rota** ficam nas
cidades escolhidas (`backend/src/opportunities/service.py:113-114`).

**A busca espera o usuário parar de digitar.** No scanner o `FilterSearch` escreve a cada tecla e
não custa nada, porque o filtro roda no navegador. Aqui cada mudança na URL é uma consulta ao
servidor, e o endpoint tem limite de 60 por minuto por usuário (`router.py:17`), somado ao polling
de 30 s. O campo mostra o texto na hora; a URL (e a consulta) só muda ~300 ms depois da última
tecla e a partir de 3 letras. Apagar a busca volta à lista sem filtro na hora.

### 2. Cabeçalho da tela

No lugar do cabeçalho de apresentação e dos cartões, o cabeçalho das telas do scanner
(`ScannerPage.tsx:541-567`): título, uma frase e uma linha de estado — `N oportunidades · página X
de Y · atualização a cada 30 s` (esta última só com a aba visível, como hoje). Os três KPIs saem:
dois descreviam só a página (#6), e o total vira a linha de estado.

### 3. Tabela

O visual da `ScannerTable`, com o dado paginado do servidor:

- ocupa a altura disponível, cabeçalho fixo, primeira coluna fixa à esquerda (`CELULA_FIXA`),
  **Lucro e ROI fixos à direita**;
- altura da linha e larguras por `emEscala` (`scanner/altura.ts`) — o Tamanho do conteúdo passa a
  valer para a tabela;
- **ordenação pelo cabeçalho** em Lucro, ROI e Idade, escrevendo `sort` na URL — o servidor ordena
  sobre o conjunto inteiro. O guard `no-client-paging-mutation` continua valendo para esta tela:
  nada de `.sort()`/`.filter()` sobre a página recebida;
- sem virtualização: são 25 linhas por página.

**Como construir:** reescrever `OpportunityTable` com o visual da `ScannerTable`, não generalizar a
`ScannerTable`. Ela é virtualizada e tipada por `ScannerRow`; abrir o tipo para servir as duas
telas mexe no componente mais sensível da fase (achados de altura medida, task 11.4) por uma tela
de 25 linhas. As constantes de visual (`CELULA_FIXA`, `ALTURA_DA_LINHA_REM`, `emEscala`) são
importadas, não copiadas.

Colunas:

| Coluna | Conteúdo | Peso |
|---|---|---|
| Item | Ícone (`ItemImage`), nome em até 2 linhas (`partesDoNomeCurto`), `grau · qualidade` embaixo; link para `/calculadora?item=` (continua); avisos de confiança como indicador na célula, com o texto acessível — **sem aumentar a altura da linha** | fixa à esquerda |
| Rota | Compra → Venda, nas cores `buy-side`/`sell-side` | — |
| Compra unit. · Venda unit. · Qtd. | como hoje | — |
| Investimento · Faturamento | como hoje | — |
| Taxas | como hoje | terciário |
| Idade | `oldest_observed_at` da **linha** (hoje só existe no KPI, e da primeira linha) | ordenável (`freshness`) |
| Lucro · ROI | como hoje | primário, fixos à direita, ordenáveis |

As colunas de reconciliação continuam todas visíveis (`faturamento − taxas − investimento =
lucro`), decisão da task 3.5/21.

### 4. Paginação

Barra compacta abaixo da tabela: Anterior · `Página X de Y` · Próxima. Mesmo comportamento de hoje
(`setOffset` preserva o resto da URL).

### 5. Estados

`EstadoErro` e `EstadoVazio` ficam, com o texto apontando os filtros "ao lado". Sem servidor
escolhido, o mesmo `RequireRealm` das telas do scanner — sem a frase do "menu superior".

### 6. O que sai

Depois da migração, sem nenhum outro importador (conferido em 2026-09-13):

| Sai | Por quê |
|---|---|
| `components/opportunities/FilterPanel.tsx` (+ teste) | Só o Flip usa; os filtros vão para `components/filters` |
| `components/opportunities/KpiCard.tsx` (+ teste) | Só o Flip usa; os KPIs saem (#6) |
| `components/opportunities/DetailDrawer.tsx` (+ teste) | **Já sem importador** desde a task 4/15, que pediu para conferir caso a caso |
| `CategorySelect` local em `pages.tsx` | Vira `FilterSelectField` |

Fica: `OpportunityTable` (reescrita), `Pagination` (restilizada), `WarningBadges` (a análise exata
do scanner usa), `TabelaCarregando` (página `/estilo` usa).

O guard `no-duplicate-opportunity-primitives.test.ts` perde as entradas de `KpiCard`,
`FilterSelect`, `FilterToggle`, `FilterNumber` e a exceção de `FilterPanel.tsx`; o teste "a tela de
Market Flip não redeclara `Kpi` / `Toggle` / `Select` locais" fica. O comentário de
`src/test/setup.ts` que cita `DetailDrawer.test.tsx` é atualizado.

## Depende de

Tasks 4/08 (shell), 4/09 (filtros), 4/10 (tabela), 4/11.1 (filtros à direita) e o Tamanho do
conteúdo (2026-09-12) — todas concluídas.

## Fora de escopo

- **Modelo do scanner para o Flip** (decisão 1).
- **Comprar em e Vender em separados; tier, encantamento e qualidade com vários valores** — pedem
  mudança no endpoint e estão na [A02](A02-filtros-do-flip-no-servidor.md).
- **Coluna de filtros no mobile** (`< md`): dívida registrada na §6 do doc 13, igual às outras telas.

## Testes automatizados

- **Guard novo nasce vermelho** (`src/test/market-flip-no-visual-do-scanner.test.ts`), rodado antes
  da mudança sobre o `pages.tsx` atual e registrado abaixo:
  - a tela publica os filtros por `SidebarSection` e não importa `FilterPanel` nem `KpiCard`;
  - nenhuma largura em rem literal em `opportunities/pages.tsx` nem em `OpportunityTable.tsx`
    (tem que passar por `emEscala`).
- `opportunities/pages.test.tsx` renderizado dentro do `AppShell` (o `SidebarSection` é portal),
  mantendo os seis comportamentos de hoje: rota, lucro, ROI e reconciliação; filtro que mantém a
  tabela anterior e vai ao servidor; vazio ≠ lucro zero; erro não vira tabela vazia; avisos de
  confiança visíveis; selo de atualização só com a aba visível. Novos:
  - clicar em Lucro/ROI/Idade escreve `sort` e dispara nova consulta;
  - a coluna Idade vem de cada linha;
  - **busca**: digitar um nome manda **uma** consulta com `item_id`, depois da pausa; menos de 3
    letras não consulta; limpar a busca remove o parâmetro.
- `a11y.test.tsx` (Market Flip, axe) verde dentro do shell.
- `no-client-paging-mutation.test.ts` e `no-duplicate-opportunity-primitives.test.ts` verdes.
- `npm run lint && npm run typecheck && npm run test`.

## Testes manuais

Com a API e o client no ar, em `/` com um servidor escolhido:

1. Os filtros aparecem na barra da direita e a tabela começa no topo da área central, ocupando a
   altura toda.
2. Trocar o Tamanho de 100% para 220%: texto, ícones e **colunas** crescem juntos, sem nome cortado
   no meio da coluna.
3. Clicar em Lucro, ROI e Idade ordena; a seta indica a direção; trocar de página mantém a ordem.
4. Digitar parte de um nome em português, com ou sem acento (ex.: "algodao"): a lista filtra
   depois de uma pausa curta, sem travar a digitação.
5. Mudar Cidades, Tier e Premium muda a lista; F5 preserva os filtros.
6. O nome do item leva à Calculadora com o item aberto.
7. Tema claro e escuro.

## Estado da implementação

**Concluída em 2026-09-13.**

Entregue:

- filtros movidos para a `SidebarSection` direita, com os primitivos compartilhados e busca por
  nome com mínimo de 3 letras e debounce de 300 ms;
- cabeçalho compacto, tabela na altura disponível, item com imagem/grau/qualidade, avisos
  compactos, Idade por linha e Lucro/ROI fixos à direita;
- larguras e alturas ligadas a `emEscala`, ordenação server-side pelos cabeçalhos e paginação
  compacta;
- remoção dos componentes exclusivos do layout antigo (`FilterPanel`, `KpiCard` e
  `DetailDrawer`) e atualização dos guards, testes unitários, acessibilidade e E2E.

Validação automatizada executada:

- o guard novo nasceu vermelho com 2 falhas esperadas (sidebar ausente e larguras em `rem`
  literal) antes da implementação;
- `npm run lint` — verde, sem erro;
- `npm run typecheck` — verde;
- `npm run test` — **562/562**, 75 arquivos;
- `npm run build` — verde;
- Playwright contra API/PostgreSQL reais — os 3 cenários afetados pelo Market Flip passaram:
  carga do dado semeado, filtro/limpeza e paginação/ordenação. A execução da suíte completa também
  revelou falhas independentes desta task em expiração de sessão e em dois fluxos antigos de
  Refino; ficam registradas para tratamento separado.

Validação manual executada no navegador real: barra direita e área central, busca com limite de 3
letras/debounce/limpeza, tema claro e escuro e escala de conteúdo até 220%. Ainda depende do
usuário repetir o roteiro completo com o client real capturando o jogo, especialmente mudanças de
cidade/premium, navegação para a Calculadora e persistência por F5.
