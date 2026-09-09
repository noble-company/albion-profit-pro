import { readFileSync } from 'node:fs'

import { expect, test } from 'vitest'

import { computeScanner, type ScannerCatalog, type ScannerParams } from './engine'
import { priceKey, type PriceIndex } from './prices'

/**
 * Task 4/06 — paridade do motor do scanner.
 *
 * Os vetores são gerados por `backend/scripts/generate_scanner_vectors.py`, e o teste de Python
 * (`tests/craft/test_scanner_vectors.py`) prova que aquela composição **é** o `simulate_craft`
 * rodando de verdade sobre um livro com profundidade sobrando. Este arquivo fecha a outra
 * ponta. Transitivamente: `computeScanner` == `simulate_craft`.
 *
 * Se alguém mexer numa taxa, numa ordem de arredondamento ou na escolha de cenário em um dos
 * lados sem mexer no outro, um dos dois testes quebra. É o ponto.
 */

const OBSERVADO = 1_757_000_000

interface Vector {
  recipe: {
    output_item: string
    production_kind: string
    enchantment_level: number
    silver_cost: number
    crafting_focus: number
    amount_crafted: number
    output_weight: string | null
    ingredients: Array<{ item: string; count: number; enchantment_level: number }>
  }
  prices: Record<string, { sell: string | null; buy: string | null }>
  params: {
    premium: boolean
    return_rate: string
    station_cost_per_execution: string
    use_focus: boolean
    output_quality: number
    quantity: number
    location: string
  }
  expected: Record<string, unknown> | null
}

const golden = JSON.parse(
  readFileSync('../backend/tests/fixtures/golden/scanner-vectors.json', 'utf8'),
) as { vectors: Vector[]; rates: Record<string, string> }

/** A chave do fixture já é `item|location|quality|ench` — a mesma de `priceKey`. */
function indexFor(vector: Vector): PriceIndex {
  const index: PriceIndex = new Map()
  for (const [key, sides] of Object.entries(vector.prices)) {
    index.set(key, {
      sell: sides.sell
        ? { price: sides.sell, observedAt: OBSERVADO, source: 'client' }
        : null,
      buy: sides.buy ? { price: sides.buy, observedAt: OBSERVADO, source: 'client' } : null,
    })
  }
  return index
}

function catalogFor(vector: Vector): ScannerCatalog {
  return {
    items: [
      {
        unique_name: vector.recipe.output_item,
        weight: vector.recipe.output_weight,
        enchantment_level: vector.recipe.enchantment_level,
      },
    ] as ScannerCatalog['items'],
    recipes: [
      {
        output_item: vector.recipe.output_item,
        production_kind: vector.recipe.production_kind,
        enchantment_level: vector.recipe.enchantment_level,
        silver_cost: vector.recipe.silver_cost,
        crafting_focus: vector.recipe.crafting_focus,
        amount_crafted: vector.recipe.amount_crafted,
        ingredients: vector.recipe.ingredients,
        upgrade_resource: null,
      },
    ] as ScannerCatalog['recipes'],
  }
}

function paramsFor(vector: Vector): ScannerParams {
  return {
    locations: [vector.params.location],
    // Paridade com `simulate_craft`, que cota ingrediente e saída na mesma cidade e devolve
    // os quatro cenários — o vetor compara o vencedor, então a estratégia fica livre.
    priceLocations: [vector.params.location],
    strategy: { acquisition: 'best', sale: 'best' },
    quantityMeans: 'desired_output',
    destinyBoard: new Map(),
    pricing: {
      base: { kind: 'sale_city' },
      manual: new Map(),
      byItemCity: new Map(),
      manualSale: new Map(),
    },
    premium: vector.params.premium,
    returnRate: vector.params.return_rate,
    stationCostPerExecution: vector.params.station_cost_per_execution,
    useFocus: vector.params.use_focus,
    outputQuality: vector.params.output_quality,
    quantity: vector.params.quantity,
  }
}

test('a chave do fixture é a mesma que o índice de preço usa', () => {
  // Se as duas convenções divergirem, todo vetor passaria por acidente com "sem preço".
  expect(priceKey('T4_FIBER', '1002', 1, 0)).toBe('T4_FIBER|1002|1|0')
})

test('computeScanner bate string a string com a composição do servidor', () => {
  expect(golden.vectors.length).toBeGreaterThanOrEqual(8)

  for (const vector of golden.vectors) {
    const [row] = computeScanner(catalogFor(vector), indexFor(vector), paramsFor(vector))
    const rotulo = JSON.stringify(vector.params)
    expect(row, rotulo).toBeDefined()

    if (vector.expected === null) {
      // Vetor sem preço suficiente: a linha **existe**, sem números.
      expect(row!.state, rotulo).not.toBe('priced')
      expect(row!.profit, rotulo).toBeNull()
      continue
    }

    expect(
      {
        state: row!.state,
        acquisition_mode: row!.acquisitionMode,
        sale_mode: row!.saleMode,
        total_cost: row!.totalCost?.toString() ?? null,
        gross_revenue: row!.grossRevenue?.toString() ?? null,
        sales_tax: row!.salesTax?.toString() ?? null,
        total_fees: row!.totalFees?.toString() ?? null,
        net_revenue: row!.netRevenue?.toString() ?? null,
        profit: row!.profit?.toString() ?? null,
        roi: row!.roi?.toString() ?? null,
        profit_per_weight: row!.profitPerWeight?.toString() ?? null,
        profit_per_focus: row!.profitPerFocus?.toString() ?? null,
        executions: row!.executions,
        produced_quantity: row!.producedQuantity,
        focus_consumed: row!.focusConsumed,
      },
      rotulo,
    ).toEqual(vector.expected)
  }
})

test('as taxas do fixture batem com as constantes do cliente', () => {
  expect(golden.rates.premium_sales_tax).toBe('0.04')
  expect(golden.rates.non_premium_sales_tax).toBe('0.08')
  expect(golden.rates.setup_fee).toBe('0.025')
})
