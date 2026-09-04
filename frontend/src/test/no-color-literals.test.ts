import { readFileSync } from 'node:fs'

import { expect, test } from 'vitest'

// F02 / task 3.5/12: o produto tinha cor em três dialetos (utilitário Tailwind cravado,
// hexadecimal, rgb()). Agora existe um sistema de tokens só (src/index.css). Este teste
// impede que um literal volte por descuido — toda cor em componente passa por um token
// semântico (bg-surface, text-profit, border-border-strong, ...).
//
// `black` e `white` seguem permitidos: não são cor de marca, são preto/branco reais usados
// em scrims e sombras (bg-black/70, shadow-black/20), e os próprios componentes shadcn os
// usam. `var(--color-...)` em atributo SVG (stroke/fill) também passa.

const TAILWIND_PALETTES = [
  'slate',
  'gray',
  'zinc',
  'neutral',
  'stone',
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'emerald',
  'teal',
  'cyan',
  'sky',
  'blue',
  'indigo',
  'violet',
  'purple',
  'fuchsia',
  'pink',
  'rose',
].join('|')

// bg-stone-950, text-amber-300/70, hover:border-emerald-400/20, from-sky-400/15, ...
const RAW_TAILWIND_COLOR = new RegExp(
  `(?:bg|text|border|ring|from|via|to|fill|stroke|outline|divide|shadow|accent|caret|decoration|placeholder)-(?:${TAILWIND_PALETTES})-\\d{2,3}\\b`,
)
const HEX_COLOR = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/
const CSS_COLOR_FN = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/

const sources: Record<string, string> = import.meta.glob('/src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
})

test('nenhum literal de cor em src/ — só tokens de design', () => {
  const offenders: string[] = []
  for (const [path, text] of Object.entries(sources)) {
    if (path.endsWith('no-color-literals.test.ts')) continue
    const lines = text.split('\n')
    lines.forEach((line, index) => {
      const where = `${path}:${index + 1}`
      if (RAW_TAILWIND_COLOR.test(line)) {
        offenders.push(`${where} — classe de cor bruta do Tailwind`)
      }
      if (HEX_COLOR.test(line)) offenders.push(`${where} — hexadecimal`)
      if (CSS_COLOR_FN.test(line)) {
        offenders.push(`${where} — função de cor CSS`)
      }
    })
  }
  expect(offenders, `\n${offenders.join('\n')}\n`).toEqual([])
})

test('index.css não tem regra de componente — só tokens, base e at-rules', () => {
  const css = readFileSync('src/index.css', 'utf8')
  expect(css, 'src/index.css não foi lido').toContain('@theme')
  // Um seletor de classe própria (.filter-field { ... }) no início de uma linha é o que
  // a task 12 removeu; esse comportamento vive nos componentes, não no CSS global.
  const classRules = css
    .split('\n')
    .map((line, index) => ({ line: line.trim(), n: index + 1 }))
    .filter(({ line }) => /^\.[-\w]/.test(line))
    .map(({ line, n }) => `src/index.css:${n} — ${line}`)
  expect(classRules, `\n${classRules.join('\n')}\n`).toEqual([])
})
