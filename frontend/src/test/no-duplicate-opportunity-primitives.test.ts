import { expect, test } from 'vitest'

// F05 / task 3.5/20: `Kpi`, `Toggle`/`Checkbox`, `Select` e `updateParam` viviam copiados
// byte a byte em `opportunities/pages.tsx` e `production-pages.tsx` (1.561 linhas fazendo o
// mesmo). Extraídos para `src/components/opportunities/` + `useOpportunityParams`. Este teste
// impede a volta da cópia.

const sources: Record<string, string> = import.meta.glob('/src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
})

function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

// Onde cada primitivo tem permissão de ser DECLARADO.
const CANON: Record<string, string> = {
  KpiCard: '/src/components/opportunities/KpiCard.tsx',
  FilterSelect: '/src/components/opportunities/FilterPanel.tsx',
  FilterToggle: '/src/components/opportunities/FilterPanel.tsx',
  FilterNumber: '/src/components/opportunities/FilterPanel.tsx',
  useOpportunityParams: '/src/opportunities/useOpportunityParams.ts',
  // Primitivos verticais da sidebar (task 4/09). A família horizontal de `FilterPanel` não
  // cabe numa coluna de 288 px, e espremer geraria a quarta cópia de `fieldLabel`.
  FilterSearch: '/src/components/filters/index.tsx',
  FilterChips: '/src/components/filters/index.tsx',
  FilterCheckbox: '/src/components/filters/index.tsx',
  FilterNumberField: '/src/components/filters/index.tsx',
  FilterSelectField: '/src/components/filters/index.tsx',
  FilterGroup: '/src/components/filters/index.tsx',
}

test('cada primitivo compartilhado é declarado uma única vez, no lugar canônico', () => {
  const offenders: string[] = []
  for (const [name, home] of Object.entries(CANON)) {
    const declRe = new RegExp(`\\b(function|const)\\s+${name}\\b`)
    for (const [path, raw] of Object.entries(sources)) {
      if (path.endsWith('.test.ts') || path.endsWith('.test.tsx')) continue
      if (declRe.test(stripComments(raw)) && path !== home) {
        offenders.push(`${path}: redeclara ${name} (canônico: ${home})`)
      }
    }
  }
  expect(offenders, `\n${offenders.join('\n')}\n`).toEqual([])
})

// F05 de novo, pela outra ponta: as strings de classe do campo de filtro estavam copiadas à
// mão em `items/pages.tsx` e `prices/pages.tsx`, além do canônico. Copiar a string é copiar o
// componente sem o nome — o guard acima não veria.
test('as classes de campo de filtro não são recopiadas à mão', () => {
  const offenders: string[] = []
  const permitido = new Set([
    '/src/components/filters/index.tsx',
    '/src/components/opportunities/FilterPanel.tsx',
  ])
  for (const [path, raw] of Object.entries(sources)) {
    if (path.endsWith('.test.ts') || path.endsWith('.test.tsx')) continue
    if (permitido.has(path)) continue
    const declara =
      /\b(const|let)\s+(fieldLabel|fieldControl|filterField|filterControl)\b/
    if (declara.test(stripComments(raw))) offenders.push(path)
  }
  expect(offenders, `\n${offenders.join('\n')}\n`).toEqual([])
})

test('nenhum `updateParam` local sobrou nas telas de oportunidade', () => {
  const offenders: string[] = []
  for (const [path, raw] of Object.entries(sources)) {
    if (path.endsWith('.test.ts') || path.endsWith('.test.tsx')) continue
    if (/\bfunction\s+updateParam\b/.test(stripComments(raw))) {
      offenders.push(path)
    }
  }
  expect(offenders, `\n${offenders.join('\n')}\n`).toEqual([])
})

test('as telas antigas não redeclaram `Kpi` / `Toggle` / `Select` locais', () => {
  const offenders: string[] = []
  for (const path of [
    '/src/opportunities/pages.tsx',
    '/src/opportunities/production-pages.tsx',
  ]) {
    const code = stripComments(sources[path] ?? '')
    for (const name of ['Kpi', 'Toggle', 'Select']) {
      if (new RegExp(`\\bfunction\\s+${name}\\s*\\(`).test(code)) {
        offenders.push(`${path}: function ${name}()`)
      }
    }
  }
  expect(offenders, `\n${offenders.join('\n')}\n`).toEqual([])
})
