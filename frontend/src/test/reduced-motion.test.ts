import { readFileSync } from 'node:fs'

import { expect, test } from 'vitest'

// F10 / task 3.5/25 item 7: quem pediu menos movimento no SO não vê animação contínua
// (o `animate-ping` do selo, o `animate-pulse` do skeleton) nem transições longas. A regra
// mora em `src/index.css` — o `@tailwindcss/vite` esvazia imports `?raw` de CSS, então lê-se
// o arquivo pelo `node:fs` (mesmo truque de contrast.test.ts / no-color-literals).
const css = readFileSync('src/index.css', 'utf8').replace(/\s+/g, ' ')

test('há uma regra global de prefers-reduced-motion que corta animação contínua', () => {
  expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/)
  expect(css).toContain('animation-iteration-count: 1 !important')
  expect(css).toContain('animation-duration: 0.01ms !important')
  expect(css).toContain('transition-duration: 0.01ms !important')
})
