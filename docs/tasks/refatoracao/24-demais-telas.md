# 24 — Calculadora, Preços/Demanda, Busca e Tokens

## Objetivo

Trazer o restante do produto para a mesma fundação, para que não fique um degrau de qualidade
entre a tela principal e as de apoio.

## Por que

Depois das tasks 21-23, Market Flip, Refino e Craft estarão sobre design system, dados em cache
e cálculo local. As demais telas ficariam visivelmente atrás — e algumas têm problemas próprios:

- **Calculadora** (`craft/pages.tsx`): o campo de item é um `<input>` de texto onde o jogador
  precisa digitar o identificador canônico (`T2_CLOTH`) — a busca de itens existe e não está
  ligada aqui. O botão "Tentar novamente" do estado de erro é `onRetry={() => undefined}`. Os
  cenários são rotulados com os valores crus da API (`immediate → sell_order`), enquanto
  `production-pages.tsx` já tem o dicionário de tradução.
- **Preços** (`prices/pages.tsx`): filtra depois de paginar (`F08`), tem o terceiro mapa de
  cidades (`F06`) e mostra o `unique_name` cru como título da página.
- **Busca** (`items/pages.tsx`): combobox com `role="listbox"` sem navegação completa por teclado
  (`ArrowDown` seleciona o primeiro item em vez de mover o foco); filtro de categoria é campo de
  texto livre, embora `/items/categories` exista.
- **Tokens** (`tokens/pages.tsx`): é a única tela que já usa TanStack Query corretamente; precisa
  só da fundação visual e de conferir a UX de copiar o token (que só aparece uma vez).

## O que implementar

1. **Calculadora:** integrar o autocomplete de busca no lugar do campo de texto; traduzir os
   rótulos de cenário reutilizando o dicionário existente; remover o `onRetry` inerte ou ligá-lo
   a um refetch real; aproveitar as preferências já persistidas em `localStorage` (a chave
   `albion-profit-pro:calculator:v1` é gravada e **nunca lida**).
2. **Preços/Demanda:** aplicar as tasks 17 e 19; exibir o nome do item, não o `unique_name` cru;
   revisar o gráfico `recharts` de demanda contra os tokens da task 12 (cores do gráfico também
   precisam ser tokens).
3. **Busca:** navegação por teclado completa no combobox (setas movem o foco, `Enter` seleciona,
   `Esc` fecha, `aria-activedescendant`); categoria vira `select` alimentado por
   `/items/categories`.
4. **Tokens:** fundação visual; confirmar que o valor cru é exibido uma vez com aviso claro e
   com ação de copiar acessível.
5. Revisar o `AppShell` conforme o layout definido na task 14 — hoje a navegação mistura links e
   dois `<select>` na mesma linha e vira um bloco solto no mobile.

## Depende de

Tasks 11-20.

## Testes automatizados

- Calculadora: selecionar item pelo autocomplete preenche o formulário e simula.
- Calculadora: as preferências persistidas são restauradas ao reabrir a tela.
- Preços: filtro de qualidade altera o `total` (task 17 verificada pela UI).
- Busca: navegação completa por teclado, com `aria-activedescendant` correto.
- Tokens: criar e revogar atualiza a lista sem recarregar.
- Nenhum `onRetry` inerte permanece em `src/`.

## Testes manuais

Percorrer o produto inteiro com teclado apenas, sem mouse, e confirmar que toda ação é
alcançável. Conferir as cinco telas em 1366×768 e no celular.

## Estado da implementação

**Concluída — feita em dois passos** (a pedido do usuário). Frontend: `typecheck` limpo ·
`lint` 0 erros (4 warnings pré-existentes) · `test` **167/167 em 38 arquivos** (+13) ·
`build` passa.

### Passo A — `ItemAutocomplete` + Calculadora + Busca ✅

Frontend: `npm run typecheck` limpo · `npm run lint` 0 erros (4 warnings pré-existentes) ·
`npm run test` **162/162 em 36 arquivos** (+8) · `npm run build` passa.

- **`src/components/ItemAutocomplete.tsx`** (novo) — combobox com navegação completa por
  teclado: `↑`/`↓` movem o item ativo via `aria-activedescendant`, `Enter` seleciona, `Esc`
  fecha, `Home`/`End` nas pontas, mouse hover sincroniza o ativo. Compartilhado.
- **Calculadora** (`craft/pages.tsx`): campo de texto → `ItemAutocomplete` (via `Controller`
  do react-hook-form, `filters={{ apenas_craftaveis: true }}`). Rótulos de cenário
  `immediate → sell_order` → `MODE_LABELS` (movido de `opportunities/labels.ts` para
  `src/lib/craft-labels.ts`). Ingrediente `unique_name` → `formatarNomeItem`. Avisos →
  `WarningBadges`. `onRetry={() => undefined}` → **refaz a última simulação de verdade**
  (`mutation.mutate(mutation.variables)`). As prefs de `albion-profit-pro:calculator:v1` —
  gravadas e **nunca lidas** — passam a semear qualidade/escopo/premium/foco no mount.
- **Busca** (`items/pages.tsx`): usa o `ItemAutocomplete`; filtro de categoria de `<input>`
  de texto livre → `<select>` de `/items/categories` (`useCategories`), rótulos por
  `traduzirCategoria`.
- Guard `src/test/no-inert-onretry.test.ts`: nenhum `onRetry={() => undefined|{}}` nas telas
  do produto (as demos `/estilo` e `/ui` ficam de fora, com comentário).

### Passo B — Preços/Demanda + AppShell + Tokens ✅

- **Preços** (`prices/pages.tsx`): `<h1>` mostra o **nome do item** (novo hook `useItem` →
  `GET /items/{unique_name}`, política `catalog`); o `unique_name` cru vira subtítulo pequeno.
  Paginação **consertada** — antes `new URLSearchParams([...params, ['offset', X]])` acrescentava
  uma segunda entrada `offset` e o `params.get('offset')` lia a antiga (mesmo bug do `W12`);
  agora um `setOffset` que apaga antes de setar. Tabela na densidade da §1 (`h-11`, `px-3`,
  `tabular-nums`, cabeçalho `bg-surface` opaco). Botões `Anterior`/`Próxima` viram `Button`.
- **Demanda** (`prices/demand.tsx`): eixos e tooltip do `recharts` passam a usar tokens
  (`var(--color-border-strong)`, `var(--color-foreground-subtle)`, `var(--color-surface)`); a
  linha já era `var(--color-primary)`.
- **`AppShell`** reconstruído no layout da task 14 §6: header `sticky top-0` com três zonas —
  **marca** · **navegação** (ícone lucide + rótulo por tela, `NavLink` com estado ativo) ·
  **controles** (servidor/tema como `Select` do shadcn, `aria-label`, sempre visíveis à
  direita). Mobile: a navegação colapsa num `Sheet` lateral; servidor/tema ficam na barra.
  `type Theme` exportado de `ThemeContext`.
- **Tokens** (`tokens/pages.tsx`): ações (`Gerar token`, `Revogar`, `Copiar segredo`,
  `Copiei e fechar`) passam pro `Button` do shadcn. O `CreatedModal` — token uma vez, aviso
  "não será mostrado novamente", "Copiei e fechar" travado até copiar — já estava certo; o
  `Dialog` acessível de verdade é da task 25.
- `renderWithProviders` ganhou `initialEntries` (pra testar telas com `useParams`).

### Pendente pra você testar

- **Calculadora**: digitar "algodão" → escolher pela seta + `Enter` → o form preenche e simula;
  recarregar mantém qualidade/premium/foco; "Tentar novamente" refaz a chamada.
- **Busca**: navegar a lista só com teclado; categoria é `select` traduzido.
- **Preços**: o título é o nome do item; "Próxima"/"Anterior" avançam de página de verdade;
  mudar a qualidade muda o `total`.
- **AppShell**: navegar só com teclado por todas as telas; no celular o menu abre no `Sheet` e
  servidor/tema continuam visíveis na barra; o header fica fixo ao rolar.
- **Gráfico de demanda**: eixos/tooltip seguem o tema (claro e escuro).
