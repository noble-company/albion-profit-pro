import { describe, expect, test } from 'vitest'

import type { components } from '@/api/schema'
import { money } from '@/lib/money'

import type { ScannerRow, ScannerState } from './engine'
import {
  applyFilters,
  DEFAULT_FILTERS,
  filtrarPorVolume,
  type ScannerFilters,
  type VolumeDaLinha,
} from './filters'

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
    saleBasis: 'city',
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

describe('vende/dia mínimo (pedido no uso, 2026-09-12)', () => {
  // O volume não mora na linha: vem do histórico de vendas e das cidades de Vender em.
  const VOLUMES: Record<string, string | null> = {
    POUCO: '7',
    NO_LIMITE: '100',
    MUITO: '12400',
    SEM_HISTORICO: null,
  }
  const volumeDe: VolumeDaLinha = (r) => {
    const valor = VOLUMES[r.outputItem]
    return valor === undefined || valor === null ? null : money(valor)
  }
  const nomes = (linhas: ScannerRow[]) => linhas.map((r) => r.outputItem)
  const com = (minVolume: string | null, showWithoutSales = true) => ({
    minVolume,
    showWithoutSales,
  })

  test('esconde o que vende menos que o mínimo; o limite exato fica', () => {
    const linhas = [row('POUCO'), row('NO_LIMITE'), row('MUITO')]

    expect(nomes(filtrarPorVolume(linhas, com('100'), volumeDe))).toEqual(['NO_LIMITE', 'MUITO'])
  })

  test('item sem histórico de venda CONTINUA aparecendo — o jogador olha a linha', () => {
    // Ausência de histórico não é zero vendido. Decisão do usuário: prefere ver e decidir.
    const linhas = [row('POUCO'), row('SEM_HISTORICO')]

    expect(nomes(filtrarPorVolume(linhas, com('100'), volumeDe))).toEqual(['SEM_HISTORICO'])
  })

  test('vale para linha sem preço também: volume é fato do mercado, não do cálculo', () => {
    const linhas = [semPreco('POUCO'), semPreco('MUITO')]

    expect(nomes(filtrarPorVolume(linhas, com('100'), volumeDe))).toEqual(['MUITO'])
  })

  test('sem mínimo, ou antes das vendas chegarem, nada é filtrado', () => {
    const linhas = [row('POUCO'), row('SEM_HISTORICO')]

    expect(filtrarPorVolume(linhas, com(null), volumeDe)).toEqual(linhas)
    // Esconder tudo enquanto o histórico carrega faria a tabela piscar vazia.
    expect(filtrarPorVolume(linhas, com('100'), null)).toEqual(linhas)
  })

  test('compara por decimal, não por Number', () => {
    const linhas = [row('POUCO')]

    expect(filtrarPorVolume(linhas, com('7'), volumeDe)).toHaveLength(1)
    expect(filtrarPorVolume(linhas, com('7.0000000001'), volumeDe)).toHaveLength(0)
  })

  test('nasce desligado', () => {
    expect(DEFAULT_FILTERS.minVolume).toBeNull()
  })
})

describe('mostrar sem volume de vendas (pedido no uso, 2026-09-12)', () => {
  const volumeDe: VolumeDaLinha = (r) =>
    r.outputItem === 'SEM_HISTORICO' ? null : money(r.outputItem === 'POUCO' ? '7' : '500')
  const nomes = (linhas: ScannerRow[]) => linhas.map((r) => r.outputItem)
  const linhas = [row('POUCO'), row('MUITO'), row('SEM_HISTORICO'), semPreco('SEM_HISTORICO')]

  test('nasce marcado: mostrar é o padrão, esconder é escolha — como "Mostrar sem preço"', () => {
    expect(DEFAULT_FILTERS.showWithoutSales).toBe(true)
    expect(
      filtrarPorVolume(linhas, { minVolume: null, showWithoutSales: true }, volumeDe),
    ).toEqual(linhas)
  })

  test('desmarcado, esconde quem não tem histórico — com ou sem preço — e só quem', () => {
    expect(
      nomes(filtrarPorVolume(linhas, { minVolume: null, showWithoutSales: false }, volumeDe)),
    ).toEqual(['POUCO', 'MUITO'])
  })

  test('junto do mínimo, some o sem histórico e o que vende pouco', () => {
    expect(
      nomes(filtrarPorVolume(linhas, { minVolume: '100', showWithoutSales: false }, volumeDe)),
    ).toEqual(['MUITO'])
  })

  test('antes das vendas chegarem, desmarcar não esconde nada', () => {
    // Sem o índice, TODA linha pareceria sem histórico — a tabela piscaria vazia.
    expect(
      filtrarPorVolume(linhas, { minVolume: null, showWithoutSales: false }, null),
    ).toEqual(linhas)
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
