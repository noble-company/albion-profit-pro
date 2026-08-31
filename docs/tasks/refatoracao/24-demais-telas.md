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
