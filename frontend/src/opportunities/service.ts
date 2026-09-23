import { apiClient, safeApiCall } from '@/api'
import type { components } from '@/api/schema'

export type Opportunity = components['schemas']['OpportunityOut']
export type OpportunityPage = components['schemas']['OpportunityPage']
export type Category = components['schemas']['CategoryOut']
export type OpportunityQuery = {
  item?: string
  category?: string
  subcategory?: string
  subcategory2?: string
  subcategory3?: string
  buyLocations?: string[]
  sellLocations?: string[]
  tiers?: number[]
  enchantments?: number[]
  qualities?: number[]
  maxAgeHours?: number
  requireComplete?: boolean
  limit: number
  offset: number
  minProfit?: string
  minRoi?: string
  profitOnly?: boolean
  premium?: boolean
  buyOrder?: boolean
  sellOrder?: boolean
  returnRate?: string
  stationCostPerExecution?: string
  useFocus?: boolean
  sort?: SortField
  direction?: SortDirection
}

export type SortField = 'profit' | 'roi' | 'freshness'
export type SortDirection = 'asc' | 'desc'

/**
 * O `<select>` de ordenação mantém o formato combinado `profit_desc` na URL (link
 * compartilhável estável); o servidor recebe `sort` e `direction` separados (F08).
 */
export function parseSortParam(raw: string | null): {
  sort: SortField
  direction: SortDirection
} {
  const [field, dir] = (raw ?? '').split('_')
  return {
    sort: field === 'roi' || field === 'freshness' ? field : 'profit',
    direction: dir === 'asc' ? 'asc' : 'desc',
  }
}

export async function getFlipOpportunities(
  server: components['schemas']['AlbionServer'],
  query: OpportunityQuery,
  signal: AbortSignal,
) {
  const response = await safeApiCall(() =>
    apiClient.GET('/opportunities/flips', {
      params: {
        query: {
          server,
          item_id: query.item,
          category: query.category,
          subcategory: query.subcategory,
          subcategory2: query.subcategory2,
          subcategory3: query.subcategory3,
          buy_location_id: query.buyLocations?.length
            ? query.buyLocations
            : undefined,
          sell_location_id: query.sellLocations?.length
            ? query.sellLocations
            : undefined,
          tier: query.tiers?.length ? query.tiers : undefined,
          enchantment_level: query.enchantments?.length
            ? query.enchantments
            : undefined,
          quality_level: query.qualities?.length ? query.qualities : undefined,
          max_age_hours: query.maxAgeHours,
          require_complete: query.requireComplete,
          limit: query.limit,
          offset: query.offset,
          // The checkbox supplies the zero floor; preserve a stricter user threshold.
          min_profit: query.profitOnly
            ? query.minProfit || '0'
            : query.minProfit,
          min_roi: query.minRoi,
          premium: query.premium,
          buy_order: query.buyOrder,
          sell_order: query.sellOrder,
          sort: query.sort,
          direction: query.direction,
        },
      },
      signal,
    }),
  )
  return response.data
}

export async function getCategories(signal: AbortSignal) {
  const response = await safeApiCall(() =>
    apiClient.GET('/items/categories', { signal }),
  )
  return response.data ?? []
}
