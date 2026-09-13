import { describe, expect, test } from 'vitest'

import { money } from '@/lib/money'

import { buildSalesIndex, formatarVolume, volumeDaVenda, type SalesOut } from './vendas'

/**
 * Task 4/23. Quantas unidades vendem por dia, ao lado do preço de venda. Um lucro de +44 mil num
 * item que vende 7 por dia não é lucro.
 */

const VENDAS = {
  server: 'west',
  days: 7,
  row_count: 4,
  items: ['T4_CLOTH', 'T5_CLOTH'],
  locations: ['1002', '3005', '1301'],
  columns: {
    item: [0, 0, 1, 1],
    location: [0, 1, 0, 2],
    quality: [1, 1, 1, 1],
    units_per_day: ['12400', '600', '5', '2.5'],
    average_price: ['1100', '1500', '900', null],
    days_with_data: [7, 7, 3, 1],
  },
} as unknown as SalesOut

describe('índice de vendas (task 23)', () => {
  test('lê o formato colunar por item, cidade e qualidade', () => {
    const indice = buildSalesIndex(VENDAS)

    expect(indice.get('T4_CLOTH|1002|1')?.toString()).toBe('12400')
    expect(indice.get('T4_CLOTH|3005|1')?.toString()).toBe('600')
  })

  test('os dois mercados de Lymhurst viram uma cidade só, e somam', () => {
    // Mesmo `canonical` do índice de preços: 1301 → 1002.
    const indice = buildSalesIndex(VENDAS, (id) => (id === '1301' ? '1002' : id))

    expect(indice.get('T5_CLOTH|1002|1')?.toString()).toBe('7.5')
    expect(indice.has('T5_CLOTH|1301|1')).toBe(false)
  })
})

describe('volume da venda de uma linha (task 23)', () => {
  const indice = buildSalesIndex(VENDAS)
  const VENDER_EM = ['1002', '3005']

  test('venda numa cidade: o volume dela', () => {
    const linha = { outputItem: 'T4_CLOTH', locationId: '3005', saleBasis: 'city' as const }
    expect(volumeDaVenda(linha, indice, VENDER_EM, 1)?.toString()).toBe('600')
  })

  test('venda pela média ou com preço fixo: a soma das cidades de Vender em', () => {
    // Não há uma cidade da venda; o que o jogador pode escoar é o que as cidades dele vendem.
    for (const saleBasis of ['average', 'manual'] as const) {
      const linha = { outputItem: 'T4_CLOTH', locationId: '1002', saleBasis }
      expect(volumeDaVenda(linha, indice, VENDER_EM, 1)?.toString()).toBe('13000')
    }
  })

  test('sem histórico é ausência, nunca zero', () => {
    const naCidade = { outputItem: 'T8_CLOTH', locationId: '1002', saleBasis: 'city' as const }
    const naMedia = { outputItem: 'T8_CLOTH', locationId: '1002', saleBasis: 'average' as const }

    expect(volumeDaVenda(naCidade, indice, VENDER_EM, 1)).toBeNull()
    expect(volumeDaVenda(naMedia, indice, VENDER_EM, 1)).toBeNull()
  })

  test('a qualidade entra na chave: vender qualidade 2 não conta o volume da 1', () => {
    const linha = { outputItem: 'T4_CLOTH', locationId: '1002', saleBasis: 'city' as const }
    expect(volumeDaVenda(linha, indice, VENDER_EM, 2)).toBeNull()
  })
})

describe('formatação do volume (task 23)', () => {
  test('compacta em pt-BR', () => {
    expect(formatarVolume(money('12400'))).toBe('12,4 mil')
    expect(formatarVolume(money('7.4'))).toBe('7,4')
    expect(formatarVolume(money('5'))).toBe('5')
  })
})
