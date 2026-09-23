import type { PriceIndex, PriceSide } from '@/scanner/prices'

export const DEFAULT_MAX_AGE_HOURS = 24

export interface ExpiredPrice {
  key: string
  item: string
  locationId: string
  quality: number
  enchantment: number
  side: 'sell' | 'buy'
  observation: PriceSide
}

export interface SanitizedPrices {
  index: PriceIndex
  expired: ExpiredPrice[]
}

export function sanitizePriceIndex(
  original: PriceIndex,
  maxAgeHours: number,
  nowEpochSeconds = Date.now() / 1000,
): SanitizedPrices {
  const cutoff = nowEpochSeconds - maxAgeHours * 60 * 60
  const index: PriceIndex = new Map()
  const expired: ExpiredPrice[] = []

  for (const [key, entry] of original) {
    const [item = '', locationId = '', qualityRaw = '0', enchantmentRaw = '0'] = key.split('|')
    const keep = (side: 'sell' | 'buy', observation: PriceSide | null) => {
      if (!observation || observation.observedAt >= cutoff) return observation
      expired.push({
        key,
        item,
        locationId,
        quality: Number(qualityRaw),
        enchantment: Number(enchantmentRaw),
        side,
        observation,
      })
      return null
    }
    index.set(key, { sell: keep('sell', entry.sell), buy: keep('buy', entry.buy) })
  }

  return { index, expired }
}

export function parseMaxAge(raw: string | null): number {
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_AGE_HOURS
}
