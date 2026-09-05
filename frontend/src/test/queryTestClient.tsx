import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'

/**
 * QueryClient isolado por teste — `test/render.tsx` reutiliza o singleton de produção
 * (`@/api/query`) de propósito para os testes de componente, mas os testes de
 * comportamento do TanStack Query (dedup, keepPreviousData, refetchInterval, abort)
 * precisam de um cliente próprio, sem retry, pra não depender do backoff real.
 */
export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

export function wrapperWithQueryClient(client: QueryClient) {
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}
