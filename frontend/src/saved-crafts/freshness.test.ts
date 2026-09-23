import { describe, expect, test } from 'vitest'

import { priceKey, type PriceIndex } from '@/scanner/prices'

import { sanitizePriceIndex } from './freshness'

describe('frescor de Meus Crafts', () => {
  const now = 2_000_000_000
  const key = priceKey('T4_CLOTH', '1002', 1, 0)

  test('cotação com 23 h continua disponível no padrão de 24 h', () => {
    const index: PriceIndex = new Map([
      [key, { sell: { price: '100', observedAt: now - 23 * 3600, source: 'client' }, buy: null }],
    ])
    const result = sanitizePriceIndex(index, 24, now)

    expect(result.index.get(key)?.sell?.price).toBe('100')
    expect(result.expired).toEqual([])
  })

  test('cotação com 25 h vira ausente, mas preserva a procedência para diagnóstico', () => {
    const index: PriceIndex = new Map([
      [key, { sell: { price: '100', observedAt: now - 25 * 3600, source: 'client' }, buy: null }],
    ])
    const result = sanitizePriceIndex(index, 24, now)

    expect(result.index.get(key)?.sell).toBeNull()
    expect(result.expired[0]).toMatchObject({ item: 'T4_CLOTH', side: 'sell' })
    expect(result.expired[0]?.observation.price).toBe('100')
  })
})
