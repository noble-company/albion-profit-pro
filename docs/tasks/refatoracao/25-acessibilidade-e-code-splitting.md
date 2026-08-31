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
