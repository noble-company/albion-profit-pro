import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { queryPolicies } from '@/api'
import type { components } from '@/api/schema'

import {
  getCategories,
  getFlipOpportunities,
  getProductionOpportunities,
  type OpportunityQuery,
  type ProductionKind,
} from './service'

/**
 * `/items/categories` alimenta só os filtros de Market Flip hoje, mas fica com chave própria
 * e política `catalog` (task 3.5/15) pra qualquer outra tela que vier a precisar dedupli-
 * car contra ela.
 */
export function useCategories() {
  const { data } = useQuery({
    queryKey: ['categories'] as const,
    queryFn: ({ signal }) => getCategories(signal),
    ...queryPolicies.catalog,
  })
  return data ?? []
}

export function useFlipOpportunities(
  server: components['schemas']['AlbionServer'] | null,
  query: OpportunityQuery,
) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['opportunities', 'flip', server, query] as const,
    queryFn: ({ signal }) => {
      if (!server) throw new Error('Selecione um servidor')
      return getFlipOpportunities(server, query, signal)
    },
    enabled: server != null,
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    ...queryPolicies.market,
  })
  return { data: data ?? null, loading: isLoading, error }
}

export function useProductionOpportunities(
  kind: ProductionKind,
  server: components['schemas']['AlbionServer'] | null,
  query: OpportunityQuery,
  options?: { pausePolling?: boolean },
) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['opportunities', kind, server, query] as const,
    queryFn: ({ signal }) => {
      if (!server) throw new Error('Selecione um servidor')
      return getProductionOpportunities(kind, server, query, signal)
    },
    enabled: server != null,
    placeholderData: keepPreviousData,
    refetchInterval: options?.pausePolling ? false : 30_000,
    refetchIntervalInBackground: false,
    ...queryPolicies.market,
  })
  return { data: data ?? null, loading: isLoading, error }
}
