import { expect, test } from 'vitest'

const sources: Record<string, string> = import.meta.glob('/src/**/*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
})

function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

test('Market Flip publica os filtros na sidebar e abandona o painel e os KPIs antigos', () => {
  const page = stripComments(sources['/src/opportunities/pages.tsx'] ?? '')

  expect(page).toContain('<SidebarSection title="Filtros">')
  expect(page).not.toMatch(/components\/opportunities\/FilterPanel/)
  expect(page).not.toMatch(/components\/opportunities\/KpiCard/)
})

test('as medidas do Market Flip acompanham o Tamanho do conteúdo', () => {
  const paths = [
    '/src/opportunities/pages.tsx',
    '/src/components/opportunities/OpportunityTable.tsx',
  ]
  const offenders = paths.filter((path) => {
    const code = stripComments(sources[path] ?? '')
    return /['"`]\d+(?:\.\d+)?rem\b/.test(code)
  })

  expect(offenders, `medidas fixas em rem: ${offenders.join(', ')}`).toEqual([])
})
