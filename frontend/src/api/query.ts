import { QueryClient } from '@tanstack/react-query'

import { isRetryableApiError } from './errors'

export const queryPolicies = {
  catalog: { staleTime: 5 * 60_000, refetchOnWindowFocus: false },
  market: { staleTime: 30_000, refetchOnWindowFocus: true },
  demand: { staleTime: 60_000, refetchOnWindowFocus: true },
  craft: { staleTime: 0, refetchOnWindowFocus: false },
} as const

/**
 * Constrói um `QueryClient` com as políticas de produção (retry só em erro retryável,
 * mutações sem retry). A aplicação usa o singleton `queryClient` abaixo; os testes de
 * componente (`src/test/render.tsx`) criam um por render para isolar o cache entre casos
 * sem abrir mão das políticas reais (task 3.5/26, item 2).
 */
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) =>
          failureCount < 2 && isRetryableApiError(error),
        staleTime: 0,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false,
      },
    },
  })
}

export const queryClient = createQueryClient()
