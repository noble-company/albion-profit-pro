import { apiClient, safeApiCall } from '@/api'
import type { components } from '@/api/schema'
export type CraftRequest = components['schemas']['CraftSimulationRequest']
export type CraftResult = components['schemas']['CraftSimulationOut']
export async function simulateCraft(payload: CraftRequest) {
  const response = await safeApiCall(() =>
    apiClient.POST('/craft/simulate', { body: payload }),
  )
  if (!response.data) throw new Error('A API não retornou a simulação')
  return response.data
}
