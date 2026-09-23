import { describe, expect, test } from 'vitest'

import { money } from '@/lib/money'

import type { SavedCraftView } from './calculation'
import { sortSavedCrafts, type SavedCraftSortField } from './sorting'

function view(
  id: string,
  name: string,
  values: { profit: string; roi: string; cost: string; volume: string; freshness: number } | null,
): SavedCraftView {
  return {
    saved: { id, server: 'west', output_item: id, quantity: 1, output_quality: 1, created_at: '', updated_at: '' },
    item: { unique_name: id, name_pt: name, enchantment_level: 0 },
    productionKind: 'crafting',
    row: values
      ? ({ profit: money(values.profit), roi: money(values.roi), totalCost: money(values.cost), oldestObservedAt: values.freshness } as SavedCraftView['row'])
      : null,
    volume: values ? money(values.volume) : null,
    params: {} as SavedCraftView['params'],
  }
}

describe('ordenação de Meus Crafts', () => {
  const lower = view('lower', 'Alfa', { profit: '10', roi: '20', cost: '30', volume: '40', freshness: 50 })
  const higher = view('higher', 'Beta', { profit: '20', roi: '30', cost: '40', volume: '50', freshness: 60 })
  const missing = view('missing', 'Gama', null)

  test.each<SavedCraftSortField>(['profit', 'roi', 'totalCost', 'volume', 'freshness'])(
    'ordena %s e mantém ausência no fim',
    (field) => {
      expect(sortSavedCrafts([lower, missing, higher], { field, direction: 'desc' }).map((entry) => entry.saved.id))
        .toEqual(['higher', 'lower', 'missing'])
    },
  )

  test('ordena pelo nome localizado', () => {
    expect(sortSavedCrafts([higher, lower], { field: 'name', direction: 'asc' }).map((entry) => entry.saved.id))
      .toEqual(['lower', 'higher'])
  })
})
