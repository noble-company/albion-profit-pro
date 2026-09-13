import { describe, expect, test } from 'vitest'

import { bestPerRecipe, computeScanner, type ScannerCatalog, type ScannerParams } from './engine'
import { buildPriceIndex, type PriceSnapshotOut } from './prices'
import { rowKey } from './ScannerTable'

/**
 * A identidade de uma linha do scanner (task 20, revista no uso).
 *
 * Reportado: "não dá pra fixar venda né, isso aí é paia". O jogador digitava o preço, clicava em
 * Fixar, e o painel sumia.
 *
 * O preço de venda fixado vale igual em todas as cidades. Com a venda empatada, a "melhor cidade"
 * de `bestPerRecipe` vira a primeira avaliada — e a chave da linha era `item|cidade`. Chave nova,
 * painel aberto que não casa mais: fechava na cara de quem acabou de clicar.
 */

const T = 1_757_000_000

// T4_CLOTH vende mais caro em 3005 que em 1002; os ingredientes custam igual nas duas.
const SNAPSHOT = {
  server: 'west',
  generated_at: new Date(T * 1000).toISOString(),
  row_count: 6,
  items: ['T4_FIBER', 'T3_CLOTH', 'T4_CLOTH'],
  locations: ['1002', '3005'],
  sources: ['client'],
  columns: {
    item: [0, 1, 2, 0, 1, 2],
    location: [0, 0, 0, 1, 1, 1],
    quality: [1, 1, 1, 1, 1, 1],
    enchantment: [0, 0, 0, 0, 0, 0],
    sell_min: ['100', '200', '1100', '100', '200', '1900'],
    sell_observed_at: [T, T, T, T, T, T],
    sell_source: [0, 0, 0, 0, 0, 0],
    buy_max: ['90', '180', '1000', '90', '180', '1800'],
    buy_observed_at: [T, T, T, T, T, T],
    buy_source: [0, 0, 0, 0, 0, 0],
  },
} as unknown as PriceSnapshotOut

const CATALOGO: ScannerCatalog = {
  items: [
    { unique_name: 'T4_CLOTH', weight: '0.51', enchantment_level: 0, tier: 4 },
    { unique_name: 'T4_FIBER', weight: '0.51', enchantment_level: 0 },
    { unique_name: 'T3_CLOTH', weight: '0.38', enchantment_level: 0 },
  ] as ScannerCatalog['items'],
  recipes: [
    {
      output_item: 'T4_CLOTH',
      production_kind: 'refining',
      enchantment_level: 0,
      silver_cost: 0,
      crafting_focus: 100,
      amount_crafted: 1,
      ingredients: [
        { item: 'T4_FIBER', count: 2, enchantment_level: 0 },
        { item: 'T3_CLOTH', count: 1, enchantment_level: 0 },
      ],
      upgrade_resource: null,
    },
  ] as ScannerCatalog['recipes'],
}

const PARAMS: ScannerParams = {
  locations: ['1002', '3005'],
  priceLocations: ['1002', '3005'],
  // Média: o custo dos ingredientes é o mesmo nas duas cidades, então só a venda decide.
  pricing: {
    base: { kind: 'average' },
    manual: new Map(),
    byItemCity: new Map(),
    manualSale: new Map(),
    saleByItem: new Map(),
  },
  strategy: { acquisition: 'best', sale: 'best' },
  quantityMeans: 'initial_recipes',
  destinyBoard: new Map(),
  premium: true,
  returnRate: '0',
  stationFeePer100Nutrition: '0',
  useFocus: false,
  outputQuality: 1,
  quantity: 1,
}

function melhorLinha(manualSale: Map<string, string>) {
  const rows = computeScanner(CATALOGO, buildPriceIndex(SNAPSHOT), {
    ...PARAMS,
    pricing: { ...PARAMS.pricing, manualSale },
  })
  return bestPerRecipe(rows)[0]!
}

describe('identidade da linha', () => {
  test('fixar o preço de venda muda a melhor cidade, mas não a identidade da linha', () => {
    const antes = melhorLinha(new Map())
    const depois = melhorLinha(new Map([['T4_CLOTH', '1500']]))

    // O cenário é real, não suposto: com a venda empatada, a melhor cidade deixa de ser 3005.
    expect(antes.locationId).toBe('3005')
    expect(depois.locationId).not.toBe(antes.locationId)

    // E a linha continua sendo a mesma para a tabela — o painel aberto não fecha.
    expect(rowKey(depois)).toBe(rowKey(antes))
  })
})
