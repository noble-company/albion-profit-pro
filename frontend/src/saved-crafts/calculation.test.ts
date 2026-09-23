import { describe, expect, test } from 'vitest'

import type { Cidade } from '@/lib/locations'
import type { ScannerCatalog } from '@/scanner/engine'
import { priceKey, type PriceIndex } from '@/scanner/prices'

import { calculateSavedCrafts } from './calculation'
import type { SavedCraft } from './service'

const CITIES: Cidade[] = [{ id: '1002', ids: ['1002'], name: 'Lymhurst' }]
const CATALOG: ScannerCatalog = {
  items: [
    { unique_name: 'T4_CLOTH', name_pt: 'Tecido', tier: 4, enchantment_level: 0, weight: '1', item_value: '0' },
    { unique_name: 'T4_FIBER', name_pt: 'Fibra', tier: 4, enchantment_level: 0 },
    { unique_name: 'T4_PLANKS', name_pt: 'Tábuas', tier: 4, enchantment_level: 0 },
  ] as ScannerCatalog['items'],
  recipes: [
    {
      output_item: 'T4_CLOTH', production_kind: 'crafting', enchantment_level: 0,
      silver_cost: '0', crafting_focus: 0, amount_crafted: 2,
      ingredients: [{ item: 'T4_FIBER', count: 1, enchantment_level: 0 }], upgrade_resource: null,
    },
    {
      output_item: 'T4_PLANKS', production_kind: 'crafting', enchantment_level: 0,
      silver_cost: '0', crafting_focus: 0, amount_crafted: 1, ingredients: [], upgrade_resource: null,
    },
  ] as ScannerCatalog['recipes'],
}
const NOW = 2_000_000_000
const side = (price: string) => ({ price, observedAt: NOW, source: 'client' })
const PRICES: PriceIndex = new Map([
  [priceKey('T4_FIBER', '1002', 1, 0), { sell: side('100'), buy: null }],
  [priceKey('T4_CLOTH', '1002', 1, 0), { sell: null, buy: side('500') }],
  [priceKey('T4_CLOTH', '1002', 3, 0), { sell: null, buy: side('800') }],
])

function saved(id: string, quantity: number, quality: number, item = 'T4_CLOTH'): SavedCraft {
  return {
    id, server: 'west', output_item: item, quantity, output_quality: quality,
    created_at: '2026-09-14T12:00:00Z', updated_at: '2026-09-14T12:00:00Z',
  }
}

describe('cálculo dos crafts salvos', () => {
  test('mantém duplicatas e aplica quantidade e qualidade próprias', () => {
    const result = calculateSavedCrafts(
      [saved('a', 3, 1), saved('b', 7, 3)], CATALOG, PRICES, CITIES, null,
    )

    expect(result.map((entry) => entry.saved.id)).toEqual(['a', 'b'])
    expect(result.map((entry) => entry.row?.producedQuantity)).toEqual([6, 14])
    expect(result[0]?.params.outputQuality).toBe(1)
    expect(result[1]?.params.outputQuality).toBe(3)
    expect(result.every((entry) => entry.productionKind === 'crafting')).toBe(true)
    expect(result.every((entry) => entry.row?.outputItem === 'T4_CLOTH')).toBe(true)
  })

  test('não calcula receita não salva e mantém removida do catálogo como indisponível', () => {
    const result = calculateSavedCrafts(
      [saved('missing', 1, 1, 'T8_REMOVED')], CATALOG, PRICES, CITIES, null,
    )

    expect(result).toHaveLength(1)
    expect(result[0]?.row).toBeNull()
    expect(result[0]?.item).toBeUndefined()
    expect(result[0]?.productionKind).toBeNull()
  })
})
