# 13 — Tema claro/escuro real

> Corrige `F03`.

## Objetivo

Fazer o seletor de tema funcionar — ou removê-lo. O que não pode continuar é um controle que
promete algo e não faz nada.

## Por que

`src/app/ThemeContext.tsx` está implementado com cuidado: grava a escolha em `localStorage`,
resolve `system` via `prefers-color-scheme`, aplica a classe `dark` e `data-theme` no
`documentElement`, e o `AppShell` expõe o `<select>` com Sistema / Claro / Escuro.

E nada disso tem efeito. Existem **zero** classes `dark:` em todo o `frontend/src` — o `grep`
retorna nenhuma ocorrência. O `:root` fixa `color-scheme: dark`, e o `AppShell` crava
`bg-stone-950 text-stone-100`. Escolher "Claro" muda o atributo no HTML e mais nada.

Um controle que mente é pior do que a ausência dele: o usuário conclui que o produto está
quebrado.

## O que implementar

**Decisão primeiro:** o produto suporta tema claro? Registrar a resposta nesta task.

### Se sim

1. Definir a paleta clara completa sobre os tokens da task 12 — sem redefinir só metade.
2. Escuro é o padrão do produto (é um app de jogo). A definição base fica no tema escuro, e o
   claro sobrescreve os tokens, ou vice-versa — o que importa é que **nenhum token exista só em
   um dos temas**.
3. Remover `color-scheme: dark` fixo do `:root`; passa a acompanhar o tema resolvido.
4. Remover as cores cravadas do `AppShell` e das telas, substituindo por tokens.
5. Cobrir o modo `system`, incluindo mudança de preferência do SO com a aba aberta
   (`matchMedia` com listener — hoje o valor é lido uma vez e nunca mais).
6. Evitar o flash de tema errado no carregamento (script inline aplicando o tema antes da
   primeira pintura).

### Se não

1. Remover o seletor do `AppShell` e o `ThemeContext`, e assumir o tema escuro como identidade.
2. Manter `color-scheme: dark` explícito e documentar a decisão.

**Recomendação:** implementar o tema claro. Os tokens da task 12 já fazem quase todo o
trabalho, e um app usado ao lado do jogo em telas claras se beneficia.

## Depende de

Task 12.

## Testes automatizados

- Alternar para "Claro" muda o token de background resolvido (teste sobre o valor computado,
  não sobre a classe).
- `system` acompanha `prefers-color-scheme` e reage à mudança com a aba aberta.
- A escolha sobrevive a recarregamento.
- Nenhum token de cor está definido em apenas um dos temas.
- Contraste AA verificado nos dois temas.

## Testes manuais

Alternar os três modos em cada tela do produto, procurando texto ilegível, borda que some e
ícone invisível. Alternar o tema do Windows com a aba aberta.
