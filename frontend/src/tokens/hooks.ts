import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createToken, listTokens, revokeToken } from './service'

export const tokensQueryKey = ['auth', 'tokens'] as const
export function useTokens() {
  return useQuery({ queryKey: tokensQueryKey, queryFn: listTokens })
}
export function useCreateToken() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: createToken,
    onSuccess: () => client.invalidateQueries({ queryKey: tokensQueryKey }),
  })
}
export function useRevokeToken() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: revokeToken,
    onSuccess: () => client.invalidateQueries({ queryKey: tokensQueryKey }),
  })
}
