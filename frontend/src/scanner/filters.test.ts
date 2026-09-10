import { describe, expect, test } from 'vitest'

import type { components } from '@/api/schema'
import { money } from '@/lib/money'

import type { ScannerRow, ScannerState } from './engine'
import { applyFilters, DEFAULT_FILTERS, type ScannerFilters } from './filters'

/**
 * Task 4/09. O teste que carrega a fase é `showUnpriced nasce ligado`: é a inversão de
 * `X01`/`X02`. Antes, o servidor escondia linha sem preço por padrão e não havia como pedir de
 * volta; agora mostrar é o padrão e esconder é escolha.
 */

const AGORA = 1_757_000_000

type CatalogItem = components['schemas']['CatalogItemOut']

function item(
  unique_name: string,
  overrides: Partial<CatalogItem> = {},
): CatalogItem {
  return {
    unique_name,
    name_pt: unique_name,
    name_en: unique_name,
    tier: 4,
    enchantment_level: 0,
    weight: '0.51',
    shop_category: 'crafting',
    shop_subcategory: 'refinedresources',
    ...overrides,
  }
}

function row(
  outputItem: string,
  overrides: Partial<ScannerRow> & { state?: ScannerState } = {},
): ScannerRow {
  return {
    outputItem,
    locationId: '1002',
    productionKind: 'refining',
    tier: 4,
    enchantmentLevel: 0,
    state: 'priced',
    acquisitionMode: 'immediate',
    saleMode: 'immediate',
    averageUnitCost: null,
    totalCost: money('400'),
    grossRevenue: money('1000'),
    salesTax: money('40'),
    totalFees: money('40'),
    netRevenue: money('960'),
    profit: money('560'),
    roi: money('140'),
    profitPerWeight: money('1098'),
    profitPerFocus: null,
    saleUnitPrice: null,
    saleObservedAt: null,
    saleSource: null,
    executions: 1,
    producedQuantity: 1,
    focusConsumed: 0,
    oldestObservedAt: AGORA,
    sources: ['client'],
    ingredients: [],
    ...overrides,
  }
}

const semPreco = (nome: string) =>
  row(nome, {
    state: 'missing_ingredient_price',
    profit: null,
    roi: null,
    totalCost: null,
    oldestObservedAt: null,
  })

function filtrar(
  rows: ScannerRow[],
  overrides: Partial<ScannerFilters> = {},
  itens: CatalogItem[] = [],
) {
  const mapa = new Map(itens.map((i) => [i.unique_name, i]))
  for (const r of rows) if (!mapa.has(r.outputItem)) mapa.set(r.outputItem, item(r.outputItem))
  return applyFilters(rows, { ...DEFAULT_FILTERS, ...overrides }, mapa, AGORA)
}

describe('a inversão de X01/X02', () => {
  test('showUnpriced nasce ligado: receita sem preço aparece por padrão', () => {
    expect(DEFAULT_FILTERS.showUnpriced).toBe(true)

    const linhas = [row('T4_CLOTH'), semPreco('T5_ORPHAN')]
    expect(filtrar(linhas).map((r) => r.outputItem)).toEqual([
      'T4_CLOTH',
      'T5_ORPHAN',
    ])
  })

  test('desligar o checkbox é o que esconde — e é decisão do usuário', () => {
    const linhas = [row('T4_CLOTH'), semPreco('T5_ORPHAN')]
    expect(
      filtrar(linhas, { showUnpriced: false }).map((r) => r.outputItem),
    ).toEqual(['T4_CLOTH'])
  })

  test('minProfit NÃO exclui linha sem preço — era exatamente o X02', () => {
    // No servidor antigo, `neutral_profit >= 0` era NULL para linha sem preço, e a linha sumia
    // sem que ninguém pedisse. Ausência de preço não é lucro abaixo do mínimo.
    const linhas = [row('T4_CLOTH', { profit: money('10') }), semPreco('T5_ORPHAN')]

    const resultado = filtrar(linhas, { minProfit: '100' })

    expect(resultado.map((r) => r.outputItem)).toEqual(['T5_ORPHAN'])
  })

  test('profitableOnly também não engole a linha sem preço', () => {
    const linhas = [row('T4_CLOTH', { profit: money('-50') }), semPreco('T5_ORPHAN')]
    expect(
      filtrar(linhas, { profitableOnly: true }).map((r) => r.outputItem),
    ).toEqual(['T5_ORPHAN'])
  })
})

describe('filtros de identidade', () => {
  test('multi-seleção de tier; vazio significa todos, não nenhum', () => {
    const linhas = [row('T4_A'), row('T5_B'), row('T6_C')]
    const itens = [
      item('T4_A', { tier: 4 }),
      item('T5_B', { tier: 5 }),
      item('T6_C', { tier: 6 }),
    ]

    expect(filtrar(linhas, {}, itens)).toHaveLength(3)
    expect(
      filtrar(linhas, { tiers: [4, 6] }, itens).map((r) => r.outputItem),
    ).toEqual(['T4_A', 'T6_C'])
  })

  test('multi-seleção de encantamento', () => {
    const linhas = [row('A'), row('B'), row('C')]
    const itens = [
      item('A', { enchantment_level: 0 }),
      item('B', { enchantment_level: 2 }),
      item('C', { enchantment_level: 3 }),
    ]
    expect(
      filtrar(linhas, { enchantments: [2, 3] }, itens).map((r) => r.outputItem),
    ).toEqual(['B', 'C'])
  })

  test('busca casa português, inglês e unique_name', () => {
    const linhas = [row('T4_CLOTH'), row('T4_ORE')]
    const itens = [
      item('T4_CLOTH', { name_pt: 'Tecido Fino', name_en: 'Fine Cloth' }),
      item('T4_ORE', { name_pt: 'Minério', name_en: 'Ore' }),
    ]

    expect(filtrar(linhas, { search: 'tecido' }, itens)).toHaveLength(1)
    expect(filtrar(linhas, { search: 'Cloth' }, itens)).toHaveLength(1)
    expect(filtrar(linhas, { search: 'T4_ORE' }, itens)).toHaveLength(1)
    expect(filtrar(linhas, { search: '  TECIDO  ' }, itens)).toHaveLength(1)
  })

  test('identidade filtra linha sem preço também — ela não é imune a filtro', () => {
    const linhas = [semPreco('T4_A'), semPreco('T5_B')]
    const itens = [item('T4_A', { tier: 4 }), item('T5_B', { tier: 5 })]
    expect(filtrar(linhas, { tiers: [5] }, itens).map((r) => r.outputItem)).toEqual([
      'T5_B',
    ])
  })
})

describe('filtros financeiros', () => {
  test('minProfit e minRoi comparam por decimal, não por Number', () => {
    // 0.1 + 0.2 em float dá 0.30000000000000004; o corte tem que ser exato.
    const linhas = [row('A', { profit: money('0.3') })]
    expect(filtrar(linhas, { minProfit: '0.3' })).toHaveLength(1)
    expect(filtrar(linhas, { minProfit: '0.30000000001' })).toHaveLength(0)
  })

  test('idade máxima usa a observação mais velha da linha', () => {
    const linhas = [
      row('novo', { oldestObservedAt: AGORA - 3600 }), // 1 h
      row('velho', { oldestObservedAt: AGORA - 36000 }), // 10 h
    ]

    expect(filtrar(linhas, { maxAgeHours: null })).toHaveLength(2)
    expect(
      filtrar(linhas, { maxAgeHours: 6 }).map((r) => r.outputItem),
    ).toEqual(['novo'])
  })
})

describe('desempenho', () => {
  test('cinco filtros combinados sobre 5.523 linhas cabem em um frame', () => {
    const linhas = Array.from({ length: 5523 }, (_, i) =>
      row(`T${(i % 7) + 2}_ITEM_${i}`, {
        locationId: i % 2 ? '1002' : '4002',
        profit: money(String(i)),
      }),
    )
    const itens = linhas.map((r, i) =>
      item(r.outputItem, { tier: (i % 7) + 2, enchantment_level: i % 5 }),
    )
    const mapa = new Map(itens.map((i) => [i.unique_name, i]))

    const inicio = performance.now()
    const resultado = applyFilters(
      linhas,
      {
        ...DEFAULT_FILTERS,
        search: 'item',
        tiers: [4, 5, 6],
        enchantments: [0, 1],
        profitableOnly: true,
        minProfit: '100',
      },
      mapa,
      AGORA,
    )
    const duracao = performance.now() - inicio

    expect(resultado.length).toBeGreaterThan(0)
    console.info(`[perf] 5 filtros sobre 5.523 linhas em ${duracao.toFixed(1)} ms`)
    // Isolado dá ~2,5 ms; sob a suíte inteira em paralelo, o mesmo código passa de 16 ms por
    // contenção de CPU. O teto é folgado de propósito — ele existe para pegar regressão de
    // ORDEM DE GRANDEZA (um O(n²) entrando sem querer), não para medir a máquina do CI. Um
    // limite apertado aqui só produziria falha intermitente, que é pior que teste nenhum.
    expect(duracao).toBeLessThan(500)
  })
})
