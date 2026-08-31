import { apiClient, safeApiCall } from '@/api'
import { ApiError } from '@/api'
import type { components } from '@/api/schema'

export type TokenPublic = components['schemas']['ApiTokenPublic']
export type TokenCreated = components['schemas']['ApiTokenCreated']

export async function listTokens() {
  const response = await safeApiCall(() => apiClient.GET('/auth/tokens'))
  return response.data ?? []
}

export async function createToken(): Promise<TokenCreated> {
  const response = await safeApiCall(() => apiClient.POST('/auth/tokens'))
  if (!response.data) throw new Error('A API não retornou o token criado')
  return response.data
}

export async function revokeToken(id: string) {
  try {
    await safeApiCall(() =>
      apiClient.DELETE('/auth/tokens/{token_id}', {
        params: { path: { token_id: id } },
      }),
    )
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return
    throw error
  }
}
