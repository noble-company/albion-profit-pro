import { describe, expect, test } from 'vitest'

import { money } from '@/lib/money'

import type { ScannerRow } from './engine'
import { DEFAULT_SORT, sortRows } from './sorting'

/**
 * Task 4/10. A regra que carrega peso aqui é: **linha sem preço vai sempre para o fim, nas duas
 * direções**. Ausência não é "o pior resultado" — ordená-la junto com número inventaria uma
 * posição que o dado não sustenta.
 */

function row(nome: string, profit: string | null, extra: Partial<ScannerRow> = {}) {
  return {
    outputItem: nome,
    locationId: '1002',
    productionKind: 'refining',
    state: profit === null ? 'missing_output_price' : 'priced',
    profit: profit === null ? null : money(profit),
    roi: profit === null ? null : money(profit),
    profitPerWeight: null,
    profitPerFocus: null,
    totalCost: null,
    oldestObservedAt: profit === null ? null : 1_757_000_000,
    ingredients: [],
    ...extra,
  } as ScannerRow
}

describe('sortRows', () => {
  test('padrão é lucro decrescente', () => {
    expect(DEFAULT_SORT).toEqual({ field: 'profit', direction: 'desc' })
  })

  test('ordena por lucro, decrescente', () => {
    const linhas = [row('a', '10'), row('b', '900'), row('c', '50')]
    expect(
      sortRows(linhas, { field: 'profit', direction: 'desc' }).map((r) => r.outputItem),
    ).toEqual(['b', 'c', 'a'])
  })

  test('linha sem preço fica no fim — inclusive ao inverter a direção', () => {
    const linhas = [row('semPreco', null), row('lucro', '10'), row('prejuizo', '-500')]

    expect(
      sortRows(linhas, { field: 'profit', direction: 'desc' }).map((r) => r.outputItem),
    ).toEqual(['lucro', 'prejuizo', 'semPreco'])

    // Crescente: prejuízo primeiro, mas a ausência NÃO sobe para o topo.
    expect(
      sortRows(linhas, { field: 'profit', direction: 'asc' }).map((r) => r.outputItem),
    ).toEqual(['prejuizo', 'lucro', 'semPreco'])
  })

  test('compara por decimal, não por string nem por float', () => {
    // Como string, '9' > '100'. Como float, 0.1+0.2 quebra. Nenhum dos dois pode acontecer.
    const linhas = [row('a', '9'), row('b', '100')]
    expect(
      sortRows(linhas, { field: 'profit', direction: 'desc' }).map((r) => r.outputItem),
    ).toEqual(['b', 'a'])
  })

  test('desempate estável por item e cidade', () => {
    const linhas = [
      row('z', '10', { locationId: '4002' }),
      row('a', '10', { locationId: '4002' }),
      row('a', '10', { locationId: '1002' }),
    ]
    const ordenado = sortRows(linhas, { field: 'profit', direction: 'desc' })
    expect(ordenado.map((r) => `${r.outputItem}|${r.locationId}`)).toEqual([
      'a|1002',
      'a|4002',
      'z|4002',
    ])
  })

  test('não muta o array de entrada', () => {
    const linhas = [row('a', '10'), row('b', '900')]
    const antes = linhas.map((r) => r.outputItem)
    sortRows(linhas, { field: 'profit', direction: 'desc' })
    expect(linhas.map((r) => r.outputItem)).toEqual(antes)
  })

  test('frescor ordena por idade da observação, com ausência no fim', () => {
    const linhas = [
      row('velho', '1', { oldestObservedAt: 1_000 }),
      row('novo', '1', { oldestObservedAt: 9_000 }),
      row('sem', null),
    ]
    expect(
      sortRows(linhas, { field: 'freshness', direction: 'desc' }).map((r) => r.outputItem),
    ).toEqual(['novo', 'velho', 'sem'])
  })
})
