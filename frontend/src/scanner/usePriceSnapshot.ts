import { useQuery } from '@tanstack/react-query'

import { apiClient, queryPolicies, safeApiCall } from '@/api'
import type { components } from '@/api/schema'

export type PriceSnapshot = components['schemas']['PriceSnapshotOut']
type Realm = components['schemas']['AlbionServer']

/**
 * Snapshot de preço do realm (task 4/03).
 *
 * Política `market` (`staleTime` 30 s) — e **nada de IndexedDB**, ao contrário do catálogo: o
 * preço muda o tempo todo, e cachear em disco só serviria para mostrar dado velho mais rápido.
 */
export function usePriceSnapshot(realm: Realm | null, locations: string[]) {
  const query = useQuery({
    // As cidades entram na chave: pedir menos cidades é um payload diferente, não um recorte
    // do mesmo. (8 cidades de uma vez dão ~333 KB — ver o limite conhecido na task 03.)
    queryKey: ['prices', 'snapshot', realm, [...locations].sort()] as const,
    queryFn: async ({ signal }) => {
      const response = await safeApiCall(() =>
        apiClient.GET('/prices/snapshot', {
          params: {
            query: {
              server: realm as Realm,
              location_id: locations.length ? locations : undefined,
            },
          },
          signal,
        }),
      )
      return response.data as PriceSnapshot
    },
    enabled: realm !== null,
    ...queryPolicies.market,
  })

  return {
    snapshot: query.data ?? null,
    loading: query.isLoading,
    error: query.error,
    updatedAt: query.dataUpdatedAt,
  }
}
