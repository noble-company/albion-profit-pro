import { useQuery } from '@tanstack/react-query'

import { apiClient, safeApiCall } from '@/api'
import type { components } from '@/api/schema'

import type { RecorteDoSnapshot } from './usePriceSnapshot'
import type { SalesOut } from './vendas'

type Realm = components['schemas']['AlbionServer']

/**
 * O histórico muda a cada 6 h (os blocos do jogo), e a média é de 7 dias completos: polling de 30 s
 * como o do preço só gastaria requisição. Uma hora de `staleTime` já é folga.
 */
const UMA_HORA = 60 * 60_000

/**
 * Unidades vendidas por dia (task 4/23), no mesmo recorte do snapshot de preço (task 22): com uma
 * categoria, só as saídas dela; sem categoria, o realm. Sem nada escolhido, nada é pedido.
 */
export function useSalesVolume(
  realm: Realm | null,
  recorte: RecorteDoSnapshot | null,
  habilitado = true,
) {
  const query = useQuery({
    queryKey: [
      'prices',
      'sales',
      realm,
      recorte ? [recorte.kind, recorte.category, recorte.subcategory] : null,
    ] as const,
    queryFn: async ({ signal }) => {
      const response = await safeApiCall(() =>
        apiClient.GET('/prices/sales', {
          params: {
            query: {
              server: realm as Realm,
              kind: recorte?.kind,
              category: recorte?.category,
              subcategory: recorte?.subcategory ?? undefined,
            },
          },
          signal,
        }),
      )
      return response.data as SalesOut
    },
    enabled: realm !== null && habilitado,
    staleTime: UMA_HORA,
    refetchOnWindowFocus: false,
  })

  return { vendas: query.data ?? null }
}
