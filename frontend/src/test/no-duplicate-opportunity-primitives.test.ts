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
