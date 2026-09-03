# 11 — shadcn/ui de verdade

> Corrige `F01`. É a primeira das quatro tasks que respondem à queixa "o frontend está feio".

## Objetivo

Instalar de fato a biblioteca de componentes que foi decidida na task 3/09 e nunca chegou ao
projeto, para que as telas parem de reinventar controles a cada arquivo.

## Por que

`frontend/components.json` existe e está configurado: shadcn/ui, estilo `new-york`, base
`neutral`, `iconLibrary: "lucide"`, aliases apontando para `@/components/ui`. Só que o
`package.json` **não tem nenhum `@radix-ui/*`, não tem `class-variance-authority` e não tem
`lucide-react`**. A pasta `src/components/ui/` contém apenas `.gitkeep`, `states.tsx` e
`ToastProvider.tsx` — nenhum componente shadcn foi gerado.

O resultado é direto: não existe `Button`, `Card`, `Table`, `Input`, `Select`, `Checkbox`,
`Dialog`, `Badge`, `Tooltip` ou `Skeleton` no produto. Cada tela monta tudo com utilitários
Tailwind soltos, e **não há um único ícone**: a interface usa `☰` para o menu, `×` para fechar,
`⇄` e `↗` como ilustração de estado vazio. É essa ausência — não o framework — que faz o produto
parecer amador.

## O que implementar

1. Instalar as dependências reais: `class-variance-authority`, `lucide-react` e os pacotes
   `@radix-ui/*` exigidos pelos componentes escolhidos. Fixar versões, como o resto do projeto.
2. Validar a compatibilidade com **Tailwind CSS 4** e **React 19** antes de fixar — o projeto
   usa Tailwind 4 com `@tailwindcss/vite`, e boa parte da documentação de shadcn ainda pressupõe
   Tailwind 3. Registrar o resultado dessa verificação na task, como foi feito com `W6`/`W7`.
3. Gerar o conjunto base em `src/components/ui/`: `button`, `card`, `table`, `input`, `select`,
   `checkbox`/`switch`, `dialog`/`sheet`, `badge`, `tooltip`, `skeleton`, `separator`,
   `dropdown-menu`, `toast` (ou `sonner`).
4. Reconciliar com o que já existe: `states.tsx` (`Carregando`, `EstadoVazio`, `EstadoErro`) e
   `ToastProvider.tsx` passam a ser construídos sobre os primitivos, não em paralelo a eles.
5. Adotar `lucide-react` e remover os caracteres usados como ícone. Confirmar que o ícone tem
   `aria-hidden` quando decorativo e rótulo acessível quando é o único conteúdo do botão.
6. **Não** reescrever telas nesta task. Aqui só entra a fundação; as telas vêm no bloco 4.

## Depende de

Task 01.

## Testes automatizados

- `npm run lint && npm run typecheck && npm run test` verdes após a instalação.
- Teste de fumaça renderizando cada componente base sem erro de console.
- Nenhum caractere usado como ícone (`☰`, `×`, `⇄`, `↗`) permanece em `src/` — verificação
  automatizada, para não voltar por descuido.
- `npm run build` continua passando e o tamanho do bundle é registrado, para comparação futura.

## Testes manuais

Abrir uma página de demonstração com todos os componentes nos dois temas e conferir foco,
teclado e estados (hover, disabled, erro).

---

## Estado da implementação

**Concluída.** `npm run lint` (0 erros, 6 warnings pré-existentes) · `npm run typecheck` limpo ·
`npm run test` 27/27 em 11 arquivos · `npm run build` passa. Backend: suíte sem regressão.

### O que entrou

1. **Dependências** (todas fixadas, `save-exact` via `.npmrc`):
   - runtime: `class-variance-authority@0.7.1`, `lucide-react@1.40.0`, `sonner@2.0.8`,
     `@radix-ui/react-{slot@1.3.3, dialog@1.1.23, dropdown-menu@2.1.24, select@2.3.7,
     checkbox@1.3.11, switch@1.3.7, tooltip@1.2.16, separator@1.1.15, label@2.1.15}`.
   - dev: `tw-animate-css@1.4.0` (substitui `tailwindcss-animate`, que não funciona em TW4).
   - `cn()`/`tailwind-merge@3.6.0`/`clsx` já existiam.
   - **`frontend/.npmrc` novo** — `legacy-peer-deps=true` porque `openapi-typescript@7.13.0`
     declara peer de `typescript@^5` e o projeto usa TS 6 (achado `W6` da Fase 3). Sem isto,
     qualquer `npm install` que adicione pacote falha no `ERESOLVE`. `save-exact=true` mantém o
     pino exato do resto do projeto.

2. **Verificação de compatibilidade TW4 / React 19 / shadcn** (ponto 2 da spec):

   | Peça | Versão no projeto | Resultado |
   |---|---|---|
   | `tailwindcss` + `@tailwindcss/vite` | 4.3.3 | OK. shadcn CLI 4.20.1 gera componentes já no dialeto TW4 (`size-*`, `bg-primary/10`, sem `tailwind.config.js`). |
   | shadcn CLI | `shadcn@4.20.1` | Suporta TW4 e React 19 nativamente (`components.json` com `"tailwind": { "config": "" }` e `cssVariables: true`). |
   | `react` / `react-dom` | 19.2.8 | OK. Radix UI (todos os pacotes acima) declara `react@^19` no peer. Nenhum warning de `findDOMNode`/refs. |
   | `tailwindcss-animate` | — | **Incompatível com TW4** (depende de `tailwind.config.js` plugin API). Trocado por `tw-animate-css@1.4.0`, importado no `index.css` com `@import 'tw-animate-css';`. |
   | tema (`next-themes`) | — | **Não adotado.** O CLI puxou `next-themes` como dep do `sonner`; removido. O `sonner.tsx` foi religado ao `@/app/ThemeContext` já existente. |
   | `toast` do shadcn | — | Descontinuado no upstream em favor de `sonner`. Geramos `sonner`, não `toast`. |

   Ajustes no dialeto TW4 (não havia em TW3): `index.css` ganhou `@custom-variant dark
   (&:is(.dark *))`, bloco `:root`/`.dark` com tokens `oklch(...)`, `@theme inline { ... }`
   mapeando os tokens para utilitários, e `@layer base { * { @apply border-border
   outline-ring/50 } }`. **Não** foi adicionado `body { @apply bg-background text-foreground }`
   para não deslocar o visual atual (o `AppShell` ainda usa `bg-stone-950`); isso é problema do
   bloco 4 (linguagem visual).

3. **Conjunto base gerado** em `src/components/ui/` (16): `button`, `card`, `table`, `input`,
   `select`, `checkbox`, `switch`, `dialog`, `sheet`, `badge`, `tooltip`, `skeleton`,
   `separator`, `dropdown-menu`, `sonner`, `label`.
   - `tooltip.tsx` reescrito para o padrão atual (o `Tooltip` embrulha o próprio
     `TooltipProvider`), senão o smoke test estoura "must be used within TooltipProvider".
   - `sonner.tsx` reescrito: `useTheme()` do `@/app/ThemeContext` no lugar de `next-themes`.

4. **Reconciliação com o que já existia**:
   - `states.tsx` — `Carregando` agora usa `Skeleton`; `EstadoVazio`/`EstadoErro` usam `Card`,
     `Button` e ícones `lucide` (`Inbox`, `AlertTriangle`). Mesmos nomes e props de export;
     `EstadoVazio` ganhou prop opcional `icon`.
   - `ToastProvider.tsx` — mantém a API `ToastProvider`/`useToast`, agora só monta o `<Toaster>`
     do `sonner` e delega `toast()` para `sonner.toast`.

5. **Ícones** — `lucide-react` adotado; caracteres removidos:
   - `AppShell.tsx`: `☰` → `<Menu className="size-5" aria-hidden="true" />`.
   - `opportunities/pages.tsx`: `⇄` (estado vazio) → `<ArrowLeftRight aria-hidden="true" />`.
   - `opportunities/production-pages.tsx`: `↗` → `<TrendingUp aria-hidden />`, botão de fechar
     `×` → `<X aria-hidden />` dentro de `<button aria-label="Limpar">`.
   - Guard automatizado: `src/test/no-icon-chars.test.ts` varre `src/**/*.{ts,tsx}` (via
     `import.meta.glob(... ?raw)`) e falha se qualquer um de `☰ ⇄ ↗ ↔ ⟳ ✕ ✖ ⌕` voltar, ou se
     aparecer `×` como conteúdo de `<button>`. O sinal de multiplicação em textos tipo
     "Fibra T4 × 2" continua permitido.

6. **Nenhuma tela foi reescrita** (ponto 6 da spec). As telas de flip/ranking/preços seguem
   como estavam; só trocaram ícone e o que `states.tsx`/`ToastProvider.tsx` renderizam por baixo.

### Arquivos novos

- `frontend/.npmrc`
- `frontend/src/components/ui/` — 16 componentes shadcn
- `frontend/src/components/ui/Preview.tsx` — rota `/ui`, **temporária** (ver abaixo)
- `frontend/src/components/ui/ui.smoke.test.tsx` — renderiza todos os primitivos + os 3
  componentes de estado e afirma zero `console.error`
- `frontend/src/test/no-icon-chars.test.ts` — guard de ícone-como-caractere

### Ajustes de infra de teste/lint

- `src/test/setup.ts` — polyfill de `window.matchMedia` (jsdom não implementa; `sonner` e o
  `ThemeContext` usam).
- `eslint.config.js` — `react-refresh/only-export-components` desligada **só** em
  `src/components/ui/**` (componentes vendorizados exportam componente + função de variantes
  `cva` no mesmo arquivo, padrão da lib).

### Tamanho do bundle (`npm run build`, para comparação futura)

| Artefato | Antes da task 11 | Depois | Δ |
|---|---|---|---|
| `index.css` | 36,42 kB (gzip 7,03) | 59,33 kB (gzip 10,51) | +22,9 kB (+3,5 gzip) |
| JS principal | 766,71 kB (gzip 228,86) | 836,44 kB (gzip 249,78) | +69,7 kB (+20,9 gzip) |
| `Preview-*.js` (chunk da rota `/ui`) | — | 145,10 kB (gzip 44,34) | isolado, só carrega em `/ui` |

O `Preview.tsx` importa todos os componentes de uma vez, então é carregado via `lazy()` num
chunk próprio para não inflar o bundle principal com código de demonstração. O aumento no
bundle principal vem do `sonner` + `class-variance-authority` + os ícones `lucide` de fato
referenciados hoje (`Menu`, `ArrowLeftRight`, `TrendingUp`, `X`) e do runtime Radix puxado por
`states.tsx`/`ToastProvider.tsx`. O CSS cresce por conta do `tw-animate-css` e das utilitárias
agora emitidas para os componentes.

### Rota de demonstração `/ui`

Temporária. Montada dentro de `RequireAuth` + `AppShell` (usa o tema real), lazy, mostrando os
16 primitivos + os 3 componentes de estado + variantes de `Button`/`Badge`. Serve para a
validação manual (foco, teclado, dois temas). **Remover quando as telas do bloco 4 estiverem
prontas** — junto com `Preview.tsx` e a rota em `App.tsx`.

### Validação humana pendente

- Abrir `/ui` com `npm run dev`, alternar tema no `AppShell` e conferir nos dois temas: foco
  visível em todos os controles, navegação por `Tab`/`Shift+Tab`/`Esc`/setas nos
  `Select`/`DropdownMenu`/`Dialog`/`Sheet`, estados `hover`/`disabled`/erro, o toast aparecendo
  no canto e sumindo, o tooltip abrindo no foco e no hover.
