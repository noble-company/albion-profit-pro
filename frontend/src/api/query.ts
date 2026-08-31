import { QueryClient } from '@tanstack/react-query'

import { isRetryableApiError } from './errors'

export const queryPolicies = {
  catalog: { staleTime: 5 * 60_000, refetchOnWindowFocus: false },
  market: { staleTime: 30_000, refetchOnWindowFocus: true },
  demand: { staleTime: 60_000, refetchOnWindowFocus: true },
  craft: { staleTime: 0, refetchOnWindowFocus: false },
} as const

export const queryClient = new QueryClient({
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
