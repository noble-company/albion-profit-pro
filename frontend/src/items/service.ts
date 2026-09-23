import { apiClient, safeApiCall } from '@/api'
import type { components } from '@/api/schema'

export type CatalogItem = components['schemas']['ItemCatalogOut']
export type SearchFilters = {
  tier?: number
  enchantment_level?: number
  category?: string
  craftable_only?: boolean
}
export async function searchItems(
  q: string,
  filters: SearchFilters,
  signal: AbortSignal,
) {
  const response = await safeApiCall(() =>
    apiClient.GET('/items/search', {
      params: { query: { q, ...filters, limit: 20 } },
      signal,
    }),
  )
  return response.data ?? []
}
