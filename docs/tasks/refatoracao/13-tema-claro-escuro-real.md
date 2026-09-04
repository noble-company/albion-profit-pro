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

---

## Estado da implementação

**Concluída — decisão: implementar tema claro** (recomendação da própria spec). `npm run
typecheck` limpo · `npm run lint` 0 erros (6 warnings pré-existentes) · `npm run test` 76/76 em
14 arquivos · `npm run build` passa.

### O que entrou

**`src/index.css`** — o `:root` (escuro, padrão) ganhou um par `:root[data-theme='light']` que
redefine **as 18 primitivas de cor**, um degrau mais escuro na escala Tailwind onde o tom claro
do dark não cumpria AA no branco (`amber-400` é 2,2:1 sobre branco → virou `amber-700` como
`primary`/`warning`; `emerald-400`/`sky-400`/`violet-400` → `-700`; `on-primary` vira branco,
já que texto escuro sobre `amber-700` não fecha 4,5:1). `color-scheme` acompanha o tema
(`dark`/`light`) em vez de fixo. `@custom-variant dark` passou a casar por `data-theme` em vez
da classe `.dark` (não havia nenhuma classe `dark:` em uso — fica pronta pra quando alguma
aparecer).

**`src/app/ThemeContext.tsx`** — reescrito:
- `resolvedTheme` (`'light'|'dark'`, nunca `'system'`) é derivado com **`useSyncExternalStore`**
  sobre `matchMedia('(prefers-color-scheme: dark)')`, não `useState`+`useEffect` — é o padrão
  correto do React para uma fonte externa que muda (o SO), e evita
  `react-hooks/set-state-in-effect`.
- `applyResolvedTheme` grava `data-theme` = tema **resolvido** e `documentElement.style.colorScheme`
  — não mais a classe `.dark`.
- Contexto agora expõe `{ theme, resolvedTheme, setTheme }`; `theme` é a escolha do usuário
  (inclui `'system'`, é o que o `<select>` do `AppShell` usa), `resolvedTheme` é o valor
  efetivo (o que `sonner` e qualquer futura lógica visual devem usar).
- `localStorage` embrulhado em `try/catch` (modo privado etc. não deve quebrar a troca de
  tema, só não persiste).

**`src/components/ui/sonner.tsx`** — usa `resolvedTheme` (nunca passa `'system'` pro `sonner`).

**`frontend/index.html`** — script inline no `<head>`, antes de qualquer CSS, que lê o
`localStorage`, resolve `system` via `matchMedia`, e aplica `data-theme` + `color-scheme` antes
da 1ª pintura. Mesma lógica do `ThemeContext`, duplicada de propósito (não dá pra importar
TS/React num script síncrono de `<head>`) — comentário cruzado nos dois arquivos.

### Guardas e testes novos

- `src/test/theme-tokens.ts` — helper compartilhado (`extractBlock`/`readTokens`/
  `readThemeBlocks`) que lê os dois blocos de `index.css` de verdade; usado por
  `contrast.test.ts` e `theme.test.tsx` pra não duplicar paleta no teste.
- `src/test/contrast.test.ts` — estendido pra rodar **os dois temas**: `nenhum token de cor
  existe em só um dos temas` (ponto 4 da spec) + todos os pares AA de antes, agora
  `describe.each` sobre `{escuro, claro}`.
- `src/test/theme.test.tsx` (novo) — 3 testes: (1) trocar pra "Claro" muda o **valor computado**
  de `--background` no `<html>` (injeta os blocos reais do `index.css` num `<style>` e lê via
  `getComputedStyle` — não testa a presença de uma classe); (2) `system` reage a
  `matchMedia('change')` com a aba aberta (mock de `MediaQueryList` com listener de verdade);
  (3) a escolha sobrevive a remontar o provider (via `localStorage`).
- `src/test/setup.ts` — `afterEach` limpa `data-theme` e `color-scheme` do `documentElement`
  entre testes.
- `src/test/no-color-literals.test.ts` — passou a ignorar comentário (`//`, `/* */`) antes de
  buscar literais, porque um comentário explicando um detalhe de CSS (`oklch(...)`) começou a
  disparar falso positivo.

### Desvios da spec

- **Nomes de token** seguem a decisão da task 12 (`--color-foreground`/`-muted`, não
  `--color-text`/`-muted`) — task 13 só estende a mesma escala, não troca nomenclatura.
- **`on-primary` muda de sentido entre temas** (escuro = quase preto, claro = branco) — a spec
  não previu isso explicitamente, mas é necessário: o mesmo texto que fica ótimo sobre
  `amber-400` (claro, no dark) fica ilegível sobre `amber-700` (escuro, no claro) e vice-versa.
  Contraste verificado nos dois sentidos.

### Verificável por mim ✅

- Todos os gates automatizados acima.
- `npm run dev`, `/login` (não exige sessão) nos dois temas via `localStorage` — claro:
  fundo branco, texto escuro legível, botão âmbar-700 com texto branco; escuro: idêntico ao
  que já existia. Zero erro no console em ambos.
- Bundle: `index.html` 0,51 → 1,24 kB (script inline), CSS 54,83 → 55,59 kB (segunda paleta),
  JS principal praticamente inalterado.

### Pendente pra você testar

1. `npm run dev`, entrar, alternar os três modos (Sistema/Claro/Escuro) no `AppShell` em
   **cada tela** do produto (Market Flip, Refino, Craft, Preços, Calculadora, Busca, Tokens) —
   procurar texto ilegível, borda que some, ícone invisível.
2. Alternar o tema do Windows com a aba aberta e `theme = 'system'` selecionado — confirmar que
   a tela muda sozinha, sem recarregar.
3. Recarregar a página em cada modo e observar se há flash de tema errado no primeiro frame
   (o script anti-flash deveria eliminar isso, mas só um humano vê o frame).
