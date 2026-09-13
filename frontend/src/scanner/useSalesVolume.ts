import { useQuery } from '@tanstack/react-query'

import { apiClient, queryPolicies, safeApiCall } from '@/api'
import type { components } from '@/api/schema'

import type { RecorteDoSnapshot } from './usePriceSnapshot'
import type { SalesOut } from './vendas'

type Realm = components['schemas']['AlbionServer']

/**
 * Unidades vendidas por dia (task 4/23), no mesmo recorte do snapshot de preço (task 22): com uma
 * categoria, só as saídas dela; sem categoria, o realm. Sem nada escolhido, nada é pedido.
 *
 * Política `demand` (task 4/29, achado `W11`): o jogador abre o histórico de um item no jogo e
 * volta para o navegador, e o backend já recalculou o diário daquela série no upload. Voltar para
 * a aba busca de novo o dado com mais de um minuto. Sem polling: o volume não muda sozinho a cada
 * 30 s como o preço, e 1 h de `staleTime` deixava o número velho até um F5.
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
    ...queryPolicies.demand,
  })

  return { vendas: query.data ?? null }
}
