import { compare } from '@/lib/money'

import type { ScannerRow } from './engine'

/**
 * Ordenação do scanner (task 4/10) — sobre o **conjunto inteiro**, no cliente.
 *
 * Isto seria o `F08` de volta se o conjunto fosse uma página do servidor: reordenar 25 linhas
 * recebidas e chamar de "melhor refino" é mentira. Aqui não é página, é o catálogo todo já
 * calculado — ordenar localmente é o único jeito correto.
 */

export type SortField =
  | 'profit'
  | 'roi'
  | 'profitPerWeight'
  | 'profitPerFocus'
  | 'totalCost'
  | 'averageUnitCost'
  | 'freshness'
  | 'item'

export type SortDirection = 'asc' | 'desc'

export interface SortState {
  field: SortField
  direction: SortDirection
}

export const DEFAULT_SORT: SortState = { field: 'profit', direction: 'desc' }

/**
 * Linha sem preço vai **sempre para o fim**, nas duas direções. Ela não é "lucro zero" nem
 * "o pior resultado" — é ausência, e ordenar ausência junto com número inventa uma posição
 * que o dado não sustenta.
 */
function compareRows(a: ScannerRow, b: ScannerRow, field: SortField): number {
  if (field === 'item') return a.outputItem.localeCompare(b.outputItem, 'pt-BR')

  if (field === 'freshness') {
    const va = a.oldestObservedAt
    const vb = b.oldestObservedAt
    if (va === null && vb === null) return 0
    if (va === null) return 1
    if (vb === null) return -1
    return va - vb
  }

  const va = a[field]
  const vb = b[field]
  if (va === null && vb === null) return 0
  if (va === null) return 1
  if (vb === null) return -1
  return compare(va, vb)
}

export function sortRows(rows: ScannerRow[], sort: SortState): ScannerRow[] {
  const semPreco = (row: ScannerRow) => row.state !== 'priced'
  const fator = sort.direction === 'asc' ? 1 : -1

  return [...rows].sort((a, b) => {
    // Ausência primeiro que direção: inverter a ordenação não pode trazer linha sem preço
    // para o topo.
    if (semPreco(a) !== semPreco(b)) return semPreco(a) ? 1 : -1

    const base = compareRows(a, b, sort.field)
    if (base !== 0) return base * fator

    // Desempate total, para a ordem ser estável entre renders e entre sessões.
    return (
      a.outputItem.localeCompare(b.outputItem, 'pt-BR') ||
      a.locationId.localeCompare(b.locationId)
    )
  })
}
