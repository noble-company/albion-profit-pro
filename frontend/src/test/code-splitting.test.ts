import { readFileSync } from 'node:fs'

import { expect, test } from 'vitest'

// F11 / task 3.5/25 item 3: `lazy(() => Promise.resolve({ default: X }))` com `X` importado
// estaticamente no topo não divide nada. Este teste trava o padrão correto — `lazy` com
// `import()` dinâmico — e proíbe a volta do import estático das telas em `App.tsx`.
const app = readFileSync('src/App.tsx', 'utf8')

const PAGE_MODULES = [
  '@/opportunities/pages',
  '@/opportunities/production-pages',
  '@/items/pages',
  '@/prices/pages',
  '@/craft/pages',
  '@/tokens/pages',
]

test('cada tela é carregada por import() dinâmico, não import estático', () => {
  for (const mod of PAGE_MODULES) {
    // nada de `import { X } from '@/opportunities/pages'` no topo
    expect(app).not.toMatch(
      new RegExp(`^import .*from '${mod.replace(/[/-]/g, '\\$&')}'`, 'm'),
    )
    // mas sim `import('@/opportunities/pages')` dentro de um lazy()
    expect(app).toContain(`import('${mod}')`)
  }
})

test('nenhum lazy() falso (Promise.resolve com default estático)', () => {
  expect(app).not.toMatch(/lazy\(\s*\(\)\s*=>\s*Promise\.resolve/)
})
