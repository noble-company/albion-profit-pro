import { apiClient, safeApiCall } from '@/api'
import type { components } from '@/api/schema'
export type ItemPrices = components['schemas']['ItemPricesOut']
export type Location = components['schemas']['LocationOut']
export type Demand = components['schemas']['DemandOut']
export async function getItemPrices(
  item: string,
  server: components['schemas']['AlbionServer'],
  scope: 'all' | 'mine',
  locations: string[],
  limit: number,
  offset: number,
  signal: AbortSignal,
) {
  const response = await safeApiCall(() =>
    apiClient.GET('/items/{item_id}/prices', {
      params: {
        path: { item_id: item },
        query: {
          server,
          scope,
          location_id: locations.length ? locations : undefined,
          limit,
          offset,
        },
      },
      signal,
    }),
  )
  return response.data
}
export async function getLocations(signal: AbortSignal) {
  const response = await safeApiCall(() =>
    apiClient.GET('/locations', { signal }),
  )
  return response.data ?? []
}
export async function getDemand(
  item: string,
  server: components['schemas']['AlbionServer'],
  location: string,
  quality: number,
  enchantment: number,
  signal: AbortSignal,
) {
  const response = await safeApiCall(() =>
    apiClient.GET('/items/{item_id}/demand', {
      params: {
        path: { item_id: item },
        query: {
          server,
          location_id: location,
          quality,
          enchantment_level: enchantment,
        },
      },
      signal,
    }),
  )
  return response.data
}
