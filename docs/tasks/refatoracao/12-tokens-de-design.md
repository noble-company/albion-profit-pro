# 12 — Tokens de design

> Corrige `F02`.

## Objetivo

Ter um sistema de estilo só, com cores e medidas nomeadas, para que a identidade visual do
produto possa mudar sem editar centenas de strings espalhadas.

## Por que

`src/index.css` declara exatamente um token: `--font-sans`. Todo o resto do produto é valor
literal, em três dialetos ao mesmo tempo:

- utilitários Tailwind cravados nos componentes (`bg-stone-950`, `text-amber-300`,
  `border-stone-800`, `text-emerald-300`);
- hexadecimais em CSS (`#fbbf24`, `#44403c`, `#a8a29e`);
- `rgb()` com alfa (`rgb(12 10 9 / 75%)`, `rgb(251 191 36 / 6%)`).

Pior: `index.css` ainda define CSS de componente à mão — `.opportunity-filters .filter-field`,
`.filter-toggle`, `.toggle-track`, `.toggle-thumb`, `.button` — que compete com o Tailwind usado
nos mesmos elementos. São dois sistemas de estilo no mesmo projeto, e nenhum deles é a autoridade.

Sem tokens, a task 13 (tema claro/escuro) é impossível: não há o que trocar.

## O que implementar

1. Definir a escala semântica em `@theme` do Tailwind 4, por papel e não por cor:
   `--color-background`, `--color-surface`, `--color-surface-raised`, `--color-border`,
   `--color-text`, `--color-text-muted`, `--color-primary`, `--color-success`,
   `--color-warning`, `--color-danger`, `--color-info`, mais escala de raio, sombra e espaçamento.
2. Mapear os papéis do domínio, que hoje estão implícitos na cor: lucro (`emerald`), aviso e
   marca (`amber`), compra (`sky`), venda (`violet`). Passam a ser tokens nomeados
   (`--color-profit`, `--color-buy-side`, `--color-sell-side`), porque significam algo — não são
   escolha estética.
3. Migrar os componentes para os tokens e **remover** todo literal de cor de `src/`.
4. Excluir de `index.css` o CSS de componente (`.filter-*`, `.toggle-*`, `.button`); esse
   comportamento passa a viver nos componentes da task 11.
5. Verificar contraste (WCAG AA) para texto e para os pares de cor usados em tabela densa.
6. Adicionar verificação automatizada que falha se um literal de cor voltar a aparecer em
   componente.

## Depende de

Task 11.

## Testes automatizados

- Nenhuma ocorrência de `#`-hex, `rgb(` ou classe de cor bruta do Tailwind (`stone-`, `amber-`,
  `emerald-`, `sky-`, `violet-`) em `src/**/*.tsx` — só tokens.
- `index.css` não contém nenhuma regra de componente (seletor de classe própria).
- Teste de contraste para os pares definidos no tema.
- `npm run build` passa e o CSS gerado não regride em tamanho de forma inesperada.

## Testes manuais

Trocar o valor de `--color-primary` e confirmar que a identidade do produto inteiro muda com
uma edição só. É esse o critério real de que a task funcionou.

---

## Estado da implementação

**Concluída.** `npm run typecheck` limpo · `npm run lint` 0 erros (6 warnings pré-existentes) ·
`npm run test` 51/51 em 13 arquivos · `npm run build` passa. Backend não foi tocado.

### O que entrou

**`src/index.css` — sistema de tokens** (F02). Reescrito: `:root` guarda a paleta primitiva
(valores dark de hoje, escala Tailwind em `oklch`) e `@theme inline` mapeia para utilitários +
reconcilia os aliases que os componentes shadcn/ui consomem. Um sistema só.

| Papel | Token | Valor (Tailwind) |
|---|---|---|
| Fundo da página | `--color-background` | stone-950 |
| Superfície (card, nav, header de tabela) | `--color-surface` | stone-900 |
| Superfície elevada (badge, chip) | `--color-surface-raised` | stone-800 |
| Borda padrão | `--color-border` | stone-800 |
| Borda forte (input, divisória) | `--color-border-strong` | stone-700 |
| Texto base | `--color-foreground` | stone-100 |
| Texto secundário | `--color-foreground-muted` | stone-400 |
| Rótulos / legendas | `--color-foreground-subtle` | clareado do stone-500 (ver contraste) |
| Texto sobre `--primary` | `--color-on-primary` | stone-950 |
| Marca / aviso | `--color-primary` / `--color-warning` | amber-400 |
| `--color-primary-hover` | | amber-300 |
| Estado positivo | `--color-success` | emerald-400 |
| Erro | `--color-danger` | red-400 |
| Informação | `--color-info` | sky-400 |
| **Lucro** (domínio) | `--color-profit` | = emerald-400 |
| **Compra / bid** (domínio) | `--color-buy-side` | = sky-400 |
| **Venda / ask** (domínio) | `--color-sell-side` | violet-400 |

Escala de raio: `--radius` + `--radius-{sm,md,lg,xl}` (mantida da task 11). Sombra e
espaçamento continuam na escala nativa do Tailwind 4 (`--shadow-*`, `--spacing`), já
tokenizadas — não inventei tokens sem consumidor. Preto/branco reais (`bg-black/70`,
`shadow-black/20`) seguem literais: não são cor de marca e o próprio shadcn os usa.

**Desvio de nome vs a spec.** A spec pedia `--color-text` / `--color-text-muted`. Usei os nomes
que os componentes shadcn/ui já consomem — `--color-foreground` / `--color-foreground-muted`
(+ `--color-foreground-subtle` para o terceiro nível, que a spec não previa mas existe em ~25
lugares) — para não manter dois vocabulários. Mesmos papéis, um só nome. `--color-primary`
deixou de ser o cinza neutro do shadcn e passou a ser âmbar (a marca): `Button`/`Badge` do
shadcn agora batem com o produto.

**Só dark, por ora.** O `:root` claro + `.dark` que o shadcn gerou na task 11 foram colapsados
num sistema só com os valores escuros. O seletor de tema no `AppShell` continua presente mas
sem efeito visual até a **task 13** ("tema claro/escuro real") — que existe exatamente para
introduzir a variação clara sobre estes mesmos nomes de token.

**CSS de componente removido.** `.opportunity-filters .filter-field`, `.filter-toggle`,
`.toggle-track`, `.toggle-thumb`, `.button` (123 linhas) saíram do `index.css`. Esse
comportamento voltou nos componentes:
- os campos de filtro viram `<label>` + `<input>`/`<select>` com dois `const` de classe
  (`fieldLabel`, `fieldControl`) em cada uma das duas telas — reescritas nas tasks 21–22, então
  a chrome mora local até lá;
- o fake-checkbox `.filter-toggle` virou o `Switch` do shadcn/ui (componente `Toggle` local);
- a paginação `.button` virou `<Button variant="outline" size="sm">`.

**Migração dos 10 arquivos `.tsx`** — troca mecânica cor→token, sem redesenhar layout:
`AppShell`, `auth/pages`, `auth/RequireAuth`, `craft/pages`, `items/pages`,
`opportunities/pages`, `opportunities/production-pages`, `prices/pages`, `prices/demand`
(`stroke="#fbbf24"` → `stroke="var(--color-primary)"`), `tokens/pages`. ~360 ocorrências.
`components/ui/*` já usava só tokens — não mudou.

### Verificação de contraste (WCAG AA)

`src/test/contrast.test.ts` lê os valores reais de `index.css` e afere com `wcagContrast` do
`culori`. Todos os pares usados passam:

| Par | Contraste | Limite |
|---|---|---|
| `foreground` / `background` | 18,1 | 4,5 |
| `foreground` / `surface` | 16,0 | 4,5 |
| `foreground-muted` / `surface` | 6,8 | 4,5 |
| `foreground-subtle` / `surface` | 5,1 | 4,5 |
| `profit` / `surface` | 8,9 | 3,0 |
| `sell-side` / `surface` | 6,2 | 3,0 |
| `on-primary` / `primary` | 11,5 | 4,5 |

`stone-500` puro (o `text-stone-500` de hoje) fica em **3,6:1** sobre surface — sub-AA. Por isso
`--color-foreground-subtle` é o stone-500 clareado até 4,5:1; é uma correção de acessibilidade
real, não só renomear.

### Guardas automatizadas

- `src/test/no-color-literals.test.ts` — falha se qualquer `.ts`/`.tsx` em `src/` voltar a ter
  hex, `rgb()`/`hsl()`/`oklch()` ou classe de cor bruta do Tailwind (22 paletas). Também afirma
  que `index.css` não tem nenhum seletor de classe própria (regra de componente).
- `src/test/contrast.test.ts` — o teste de contraste acima.
- `src/test/raw-source.d.ts` — declaração mínima de `node:fs`. Necessária porque o plugin
  `@tailwindcss/vite` intercepta todo import de CSS (inclusive `?raw`) e devolve string vazia,
  então os dois testes leem `index.css` via `fs`; o tsconfig do app não inclui os tipos de
  `node` de propósito.

### Dependências

- devDep `culori@4.0.2` (zero dependências, MIT) + `@types/culori@4.0.1` — só para o teste de
  contraste. Ambas exact-pinned.

### Rota `/ui`

Ganhou uma seção "Tokens de design" com um swatch de cada `--color-*`, para a validação manual
do swap de identidade.

### Tamanho do bundle

| Artefato | Task 11 | Task 12 | Δ |
|---|---|---|---|
| `index.css` | 59,33 kB (gzip 10,51) | 54,83 kB (gzip 9,44) | **−4,5 kB** (−1,1 gzip) |
| JS principal | 836,44 kB (gzip 249,78) | 846,56 kB (gzip 253,44) | +10,1 kB (+3,7 gzip) |

O CSS **encolheu** (menos classes de cor literais + 123 linhas de CSS à mão removidas). O JS
principal subiu porque `Switch` e `Button` do shadcn agora são importados pelas telas de
oportunidade (antes eram markup à mão).

### Verificável por mim ✅

- Todos os gates acima.
- Servidor de dev + `/login` renderiza com os tokens (fundo, marca âmbar, botão, borda).
- **Critério da task:** sobrescrevi `--primary` para azul no console → "ALBION PROFIT PRO", o
  botão, a borda do card e os realces mudaram todos de uma vez. O swap de identidade funciona.
- Zero erro no console do browser.

### Pendente pra você testar

1. `npm run dev`, entrar, abrir `/ui`. Nos **dois estados de tema** (o toggle não muda nada
   ainda — task 13 — mas confira que está tudo legível): conferir foco visível, navegação por
   teclado, `hover`/`disabled`/erro em cada primitivo e nos swatches de token.
2. Passar pelas telas reais (Market Flip, Refino, Craft, Preços, Calculadora, Busca, Tokens,
   login/registro) e confirmar que **nada mudou de aparência** — a migração foi mecânica. Os
   filtros de Market Flip/Refino/Craft agora usam o `Switch` do shadcn no lugar do toggle à
   mão; confira que ligam/desligam e que o clique no rótulo inteiro funciona.
3. Editar `--color-primary` em `src/index.css` (ex.: trocar por um verde), rodar `npm run dev`
   e confirmar que a marca inteira muda numa edição só.
