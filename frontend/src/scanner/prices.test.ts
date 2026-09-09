import { describe, expect, test } from 'vitest'

import { buildPriceIndex, priceKey, type PriceSnapshotOut } from './prices'

/**
 * Task 4/11.2.2. O que está sob teste é a **fusão de mercados da mesma cidade**: Lymhurst tem
 * dois `location_id` na tabela `location` (`1002` e `1301`), e sem fundir os dois o preço
 * capturado num deles não aparece no outro — a mesma cidade, com dois preços diferentes.
 */

function snapshot(
  linhas: Array<{
    item: string
    location: string
    sell?: [string, number]
    buy?: [string, number]
    source?: string
  }>,
): PriceSnapshotOut {
  const items: string[] = []
  const locations: string[] = []
  const sources: string[] = []
  const idx = (registry: string[], value: string) => {
    const found = registry.indexOf(value)
    if (found >= 0) return found
    registry.push(value)
    return registry.length - 1
  }

  const columns = {
    item: [] as (number | null)[],
    location: [] as (number | null)[],
    quality: [] as (number | null)[],
    enchantment: [] as (number | null)[],
    sell_min: [] as (string | null)[],
    sell_observed_at: [] as (number | null)[],
    sell_source: [] as (number | null)[],
    buy_max: [] as (string | null)[],
    buy_observed_at: [] as (number | null)[],
    buy_source: [] as (number | null)[],
  }

  for (const linha of linhas) {
    columns.item.push(idx(items, linha.item))
    columns.location.push(idx(locations, linha.location))
    columns.quality.push(1)
    columns.enchantment.push(0)
    columns.sell_min.push(linha.sell?.[0] ?? null)
    columns.sell_observed_at.push(linha.sell?.[1] ?? null)
    columns.sell_source.push(linha.sell ? idx(sources, linha.source ?? 'client') : null)
    columns.buy_max.push(linha.buy?.[0] ?? null)
    columns.buy_observed_at.push(linha.buy?.[1] ?? null)
    columns.buy_source.push(linha.buy ? idx(sources, linha.source ?? 'client') : null)
  }

  return {
    row_count: linhas.length,
    items,
    locations,
    sources,
    columns,
  } as PriceSnapshotOut
}

const CANONICO = (id: string) => (id === '1301' ? '1002' : id)

describe('mercados da mesma cidade', () => {
  test('sem canonicalização, cada id continua sendo o seu próprio mercado', () => {
    const index = buildPriceIndex(
      snapshot([
        { item: 'T5_ORE', location: '1002', sell: ['100', 1000] },
        { item: 'T5_ORE', location: '1301', sell: ['200', 2000] },
      ]),
    )

    expect(index.get(priceKey('T5_ORE', '1002', 1, 0))?.sell?.price).toBe('100')
    expect(index.get(priceKey('T5_ORE', '1301', 1, 0))?.sell?.price).toBe('200')
  })

  test('fundidos, a observação mais recente vence — por lado', () => {
    // Mesma regra do backend (`_UPSERT_SET` em `prices/snapshot.py`): o lado é decidido pelo
    // `observed_at`, não pela ordem em que as linhas chegaram. Aqui a venda mais nova está em
    // `1301` e a compra mais nova em `1002`; o resultado tem que pegar uma de cada.
    const index = buildPriceIndex(
      snapshot([
        { item: 'T5_ORE', location: '1002', sell: ['100', 1000], buy: ['90', 5000] },
        { item: 'T5_ORE', location: '1301', sell: ['200', 9000], buy: ['80', 2000] },
      ]),
      CANONICO,
    )

    const entrada = index.get(priceKey('T5_ORE', '1002', 1, 0))
    expect(entrada?.sell?.price).toBe('200')
    expect(entrada?.buy?.price).toBe('90')
    // O id fundido deixa de existir como mercado separado.
    expect(index.has(priceKey('T5_ORE', '1301', 1, 0))).toBe(false)
  })

  test('um lado ausente não apaga o lado que já existia', () => {
    const index = buildPriceIndex(
      snapshot([
        { item: 'T5_ORE', location: '1002', sell: ['100', 1000] },
        { item: 'T5_ORE', location: '1301', buy: ['90', 9000] },
      ]),
      CANONICO,
    )

    const entrada = index.get(priceKey('T5_ORE', '1002', 1, 0))
    expect(entrada?.sell?.price).toBe('100')
    expect(entrada?.buy?.price).toBe('90')
  })
})
