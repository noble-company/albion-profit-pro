import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { queryPolicies } from '@/api'
import type { components } from '@/api/schema'

import { getItemPrices, getLocations } from './service'

/**
 * `/locations` é pedido por preços, calculadora e ranking de produção — mesma chave de
 * query em todo lugar, então o TanStack Query deduplica sozinho (task 3.5/15).
 */
export function useLocations() {
  const { data } = useQuery({
    queryKey: ['locations'] as const,
    queryFn: ({ signal }) => getLocations(signal),
    ...queryPolicies.catalog,
  })
  return data ?? []
}

export function useItemPrices(
  item: string,
  server: components['schemas']['AlbionServer'] | null,
  scope: 'all' | 'mine',
  locations: string[],
  limit: number,
  offset: number,
  filters: { quality?: number; enchantment?: number } = {},
) {
  const { data, isLoading, error } = useQuery({
    queryKey: [
      'prices',
      'item',
      item,
      server,
      scope,
      locations,
      limit,
      offset,
      filters,
    ] as const,
    queryFn: ({ signal }) => {
      if (!server) throw new Error('Selecione um servidor')
      return getItemPrices(
        item,
        server,
        scope,
        locations,
        limit,
        offset,
        signal,
        filters,
      )
    },
    enabled: server != null,
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    ...queryPolicies.market,
  })
  return { data: data ?? null, loading: isLoading, error }
}
