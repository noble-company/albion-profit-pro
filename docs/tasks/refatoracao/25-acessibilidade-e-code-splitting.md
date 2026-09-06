# 25 — Acessibilidade e code splitting

> Corrige `F10` e `F11`.

## Objetivo

Fechar os defeitos de acessibilidade e os rituais sem efeito que sobraram, agora que os
componentes vivem em um lugar só.

## Por que

**Diálogo sem acessibilidade real.** `DetailDrawer` declara `role="dialog"` e `aria-modal="true"`,
mas não move o foco para dentro ao abrir, não prende o foco (Tab escapa para a página atrás),
não fecha com `Esc`, não devolve o foco ao elemento que o abriu e não trava o scroll do body.
Os atributos ARIA prometem um comportamento que o componente não entrega — para um leitor de
tela, é pior que não ter o `role`.

**Toast de uma mensagem só.** `ToastProvider` guarda `useState<string | null>`: uma segunda
notificação sobrescreve a primeira, e nada some sozinho. Não há fila nem auto-dismiss.

**`lazy()` que não divide nada.**

```ts
const LazyHome = lazy(() => Promise.resolve({ default: MarketFlipPage }))
```

`MarketFlipPage` já está importada estaticamente no topo do `App.tsx`. O `Suspense` existe, o
code splitting não. Quatro rotas fazem isso; duas (`/refino`, `/craft`) nem isso.

**Resíduos.** `formatarNomeJogador` formata nome de item; `EstadoErro onRetry={() => undefined}`;
`useItemPrices` com `AbortController` descartado (resolvido na task 15, verificar aqui).

## O que implementar

1. Diálogo/drawer sobre o primitivo `Dialog`/`Sheet` do Radix (task 11), que já resolve trap de
   foco, `Esc`, restauração de foco, scroll lock e `aria-*` corretos. Não reimplementar à mão.
2. Toast com fila, auto-dismiss configurável, pausa no hover e região `aria-live` adequada —
   usando o primitivo da task 11.
3. Code splitting real: `lazy(() => import('@/opportunities/pages'))`, removendo os imports
   estáticos correspondentes, e aplicar a todas as rotas (inclusive `/refino` e `/craft`).
   Registrar o tamanho do bundle antes e depois — se não mudar, o splitting não aconteceu.
4. `Suspense` com o skeleton da task 14 no lugar de `<p role="status">Carregando…</p>`.
5. Renomear `formatarNomeJogador` para algo que descreva o que ela faz (tratada na task 19;
   confirmar aqui que não sobrou uso).
6. Varredura de acessibilidade em todas as telas: rótulo em todo controle, ordem de foco
   coerente, `aria-live` nos estados assíncronos, contraste (task 13), alvo de toque adequado no
   mobile.
7. Respeitar `prefers-reduced-motion` — hoje há `animate-ping` permanente no selo de atualização.

## Depende de

Tasks 11, 14, 15 e 20-24.

## Testes automatizados

- Abrir o drawer move o foco para dentro; `Tab` não escapa; `Esc` fecha; o foco volta ao gatilho.
- Duas notificações seguidas aparecem ambas e somem sozinhas.
- `axe` sem violação séria em todas as rotas.
- O build gera chunks separados por rota — verificado sobre o manifesto, não por inspeção visual.
- `prefers-reduced-motion` desliga as animações contínuas.

## Testes manuais

Percorrer o produto com leitor de tela (NVDA no Windows) e confirmar que abrir e fechar o
detalhe é anunciado corretamente.

## Estado da implementação

**Concluída.** Frontend: `typecheck` limpo · `lint` 0 erros (4 warnings pré-existentes) ·
`test` **179/179 em 43 arquivos** (+12) · `build` passa (e **sem mais o aviso de chunk > 500 kB**).

### O que mudou

- **`DetailDrawer` → `Sheet` do Radix** (item 1): trap de foco, `Esc`, restauração de foco ao
  gatilho e scroll lock vêm do primitivo. O parent passa `open`/`onOpenChange` no lugar de
  `{selected && …}`. O nome acessível do diálogo agora é o nome do item (via `SheetTitle`).
- **`CreatedModal` (Tokens) → `Dialog` do Radix** (item 1): mantém a regra "token uma vez /
  travar até copiar" — `onEscapeKeyDown`/`onInteractOutside` bloqueados enquanto não copiou.
- **Toast — já era `sonner`** (item 2): `ToastProvider` já é um wrapper fino (fila,
  empilhamento, auto-dismiss, `aria-live`, pausa no hover). Só ganhou teste.
- **Code splitting de verdade** (item 3): `App.tsx` troca `lazy(() => Promise.resolve({default: X}))`
  (com `X` importado estático) por `lazy(() => import('@/…'))` em **todas** as rotas de tela,
  inclusive `/refino` e `/craft` (que nem fingiam). `/refino` e `/craft` compartilham o chunk
  de `production-pages`.
  - **Bundle antes:** `index-*.js` ≈ **975 kB** (com aviso de chunk grande).
  - **Bundle depois:** `index-*.js` **495 kB** + chunks por rota — `pages-kO07bOvZ.js` 328 kB
    (Preços + `recharts`, só baixado ao abrir `/item/:uniqueName`), `production-pages` 15 kB,
    demais `pages-*` de 2 a 9 kB, `LinguagemVisualPage`/`Preview` (rotas dev) fora do caminho.
- **Suspense com skeleton** (item 4): `<p role="status">Carregando…</p>` → `<Carregando />`
  (skeleton da task 14).
- **`formatarNomeJogador`** (item 5): renomeado na task 19, guard `no-hardcoded-location-map`
  já proíbe a volta. Confirmado — nenhum uso.
- **Varredura `axe`** (item 6): `src/test/a11y.test.tsx` renderiza Market Flip, Refino,
  Calculadora, Busca, Preços e Tokens (providers + MSW benigno) e falha em violação **séria**
  ou **crítica**. `color-contrast` desligado no jsdom (sem CSS compilado — o contraste real
  fica em `contrast.test.ts`). Zero violação séria hoje.
- **`prefers-reduced-motion`** (item 7): regra global em `src/index.css` que corta
  `animation-duration`/`iteration-count`/`transition-duration` — cobre o `animate-ping` do
  selo, o `animate-pulse` do skeleton e as animações do Radix de uma vez.

### Novos testes (os 5 bullets)

- `DetailDrawer.test.tsx`: foco entra no diálogo ao abrir, `Esc` fecha, `Tab` não escapa (a
  restauração de foco ao gatilho é garantia do Radix, verificada no navegador — o jsdom não
  modela esse passo).
- `toast.test.tsx`: duas notificações seguidas aparecem ambas e somem sozinhas.
- `a11y.test.tsx`: `axe` sem violação séria nas seis telas.
- `code-splitting.test.ts`: cada tela via `import()` dinâmico, nenhum `lazy(() => Promise.resolve)`.
- `reduced-motion.test.ts`: a regra global existe no CSS.

### Desvios da spec

- O teste de code splitting checa o **padrão em `App.tsx`** (import dinâmico + ausência de
  import estático das telas), não o manifesto do `dist` — os testes rodam sem build. O
  resultado do build (números acima) fica registrado neste doc.
- Restauração de foco ao fechar o drawer não é testada automaticamente (limitação do jsdom
  com o `onCloseAutoFocus` do Radix) — fica pro teste manual com NVDA.

### Pendente pra você testar

- **NVDA / teclado**: abrir "Analisar" numa linha de Refino → o foco entra no drawer, `Tab`
  circula só dentro dele, `Esc` fecha e o foco volta pro botão "Analisar" da linha.
- **Tokens**: gerar um token → o modal não fecha por `Esc`/clique fora até copiar; depois de
  "Copiar segredo", "Copiei e fechar" funciona.
- **Movimento reduzido**: ligar "reduzir movimento" no Windows → o pontinho piscante do selo
  "Atualização automática" para; skeletons não pulsam.
- **Splitting**: aba de rede do navegador → ao trocar de rota, um chunk `.js` novo é baixado
  sob demanda (não tudo no primeiro load).
