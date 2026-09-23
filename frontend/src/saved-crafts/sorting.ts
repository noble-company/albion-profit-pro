import type { Money } from '@/lib/money'

import type { SavedCraftView } from './calculation'

export type SavedCraftSortField =
  | 'name'
  | 'profit'
  | 'roi'
  | 'totalCost'
  | 'volume'
  | 'freshness'

export interface SavedCraftSort {
  field: SavedCraftSortField
  direction: 'asc' | 'desc'
}

function compareValues(a: Money | number | string, b: Money | number | string): number {
  if (typeof a === 'string') return typeof b === 'string' ? a.localeCompare(b, 'pt-BR') : 0
  if (typeof b === 'string') return 0
  if (typeof a === 'number') return typeof b === 'number' ? a - b : 0
  if (typeof b === 'number') return 0
  return a.comparedTo(b)
}

function sortValue(view: SavedCraftView, field: SavedCraftSortField): Money | number | string | null {
  if (field === 'name') return view.item?.name_pt ?? view.item?.name_en ?? view.saved.output_item
  if (field === 'profit') return view.row?.profit ?? null
  if (field === 'roi') return view.row?.roi ?? null
  if (field === 'totalCost') return view.row?.totalCost ?? null
  if (field === 'volume') return view.volume ?? null
  return view.row?.oldestObservedAt ?? null
}

export function sortSavedCrafts(
  views: readonly SavedCraftView[],
  sort: SavedCraftSort,
): SavedCraftView[] {
  return [...views].sort((a, b) => {
    const aValue = sortValue(a, sort.field)
    const bValue = sortValue(b, sort.field)
    // Ausência nunca vira “melhor resultado” quando o usuário inverte a ordem.
    if (aValue === null) return bValue === null ? a.saved.id.localeCompare(b.saved.id) : 1
    if (bValue === null) return -1
    const result = compareValues(aValue, bValue)
    if (result !== 0) return sort.direction === 'asc' ? result : -result
    return a.saved.id.localeCompare(b.saved.id)
  })
}
