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
