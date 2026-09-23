import { expect, test } from 'vitest'

import { computeScanner, type ScannerCatalog } from './engine'
import { buildPriceIndex, type PriceSnapshotOut } from './prices'

/**
 * Task 4/05. Não é um limite arbitrário: é a prova de que a decisão da fase — calcular tudo no
 * navegador em vez de num job de 10 em 10 minutos — se sustenta na escala real do catálogo
 * (5.523 receitas de craft). O número medido fica no estado da implementação.
 *
 * O teto é folgado de propósito. Ele existe para pegar uma regressão de ordem de grandeza
 * (um O(n²) que entre sem querer), não para medir a máquina de quem roda o CI.
 */

const RECEITAS = 5523
const CIDADE = '1002'

function catalogoSintetico(): { catalog: ScannerCatalog; snapshot: PriceSnapshotOut } {
  const items: ScannerCatalog['items'] = []
  const recipes: ScannerCatalog['recipes'] = []
  const linhas: Array<[string, string | null, string | null]> = []

  for (let i = 0; i < RECEITAS; i += 1) {
    const saida = `T4_OUT_${i}`
    const ing1 = `T4_ING_${i % 400}`
    const ing2 = `T3_ING_${i % 250}`
    items.push({ unique_name: saida, weight: '0.51', enchantment_level: 0 })
    recipes.push({
      output_item: saida,
      production_kind: 'crafting',
      enchantment_level: 0,
      silver_cost: '12',
      crafting_focus: 100,
      amount_crafted: 1,
      ingredients: [
        { item: ing1, count: 2, enchantment_level: 0, return_eligible: true },
        { item: ing2, count: 1, enchantment_level: 0, return_eligible: true },
      ],
      upgrade_resource: null,
    })
    linhas.push([saida, '1100', '1000'])
  }
  for (let i = 0; i < 400; i += 1) linhas.push([`T4_ING_${i}`, '100', '90'])
  for (let i = 0; i < 250; i += 1) linhas.push([`T3_ING_${i}`, '200', '180'])

  const nomes: string[] = []
  const columns = {
    item: [] as number[], location: [] as number[], quality: [] as number[],
    enchantment: [] as number[], sell_min: [] as (string | null)[],
    sell_observed_at: [] as (number | null)[], sell_source: [] as (number | null)[],
    buy_max: [] as (string | null)[], buy_observed_at: [] as (number | null)[],
    buy_source: [] as (number | null)[],
  }
  for (const [item, sell, buy] of linhas) {
    nomes.push(item)
    columns.item.push(nomes.length - 1)
    columns.location.push(0)
    columns.quality.push(1)
    columns.enchantment.push(0)
    columns.sell_min.push(sell)
    columns.sell_observed_at.push(sell ? 1_757_000_000 : null)
    columns.sell_source.push(sell ? 0 : null)
    columns.buy_max.push(buy)
    columns.buy_observed_at.push(buy ? 1_757_000_000 : null)
    columns.buy_source.push(buy ? 0 : null)
  }

  return {
    catalog: { items, recipes },
    snapshot: {
      server: 'west', generated_at: new Date().toISOString(), row_count: linhas.length,
      items: nomes, locations: [CIDADE], sources: ['client'], columns,
    },
  }
}

test('calcula o catálogo de craft inteiro numa cidade sem estourar a ordem de grandeza', () => {
  const { catalog, snapshot } = catalogoSintetico()
  const index = buildPriceIndex(snapshot)

  const inicio = performance.now()
  const linhas = computeScanner(catalog, index, {
    locations: [CIDADE], premium: true, returnRate: '0.367',
    strategy: { acquisition: 'best', sale: 'best' },
    quantityMeans: 'desired_output',
    destinyBoard: new Map(),
    priceLocations: [CIDADE],
    pricing: {
      base: { kind: 'sale_city' },
      manual: new Map(),
      byItemCity: new Map(),
      manualSale: new Map(),
      saleByItem: new Map(),
    },
    stationFeePer100Nutrition: '0', useFocus: true, outputQuality: 1, quantity: 1,
  })
  const duracao = performance.now() - inicio

  expect(linhas).toHaveLength(RECEITAS)
  expect(linhas.every((l) => l.state === 'priced')).toBe(true)
  console.info(
    `[perf] ${RECEITAS} receitas x 1 cidade = ${linhas.length} linhas em ${duracao.toFixed(0)} ms`,
  )
  expect(duracao).toBeLessThan(5000)
})
