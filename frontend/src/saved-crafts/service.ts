import { apiClient, safeApiCall } from '@/api'
import type { components } from '@/api/schema'
import type { Realm } from '@/app/ServerContext'

export type SavedCraft = components['schemas']['SavedCraftOut']
export type SavedCraftCreate = components['schemas']['SavedCraftCreate']

export function savedCraftFromScenario(
  server: Realm,
  outputItem: string,
  scenario: { quantity: number; outputQuality: number },
): SavedCraftCreate {
  return {
    server,
    output_item: outputItem,
    quantity: scenario.quantity,
    output_quality: scenario.outputQuality,
  }
}

export async function getSavedCrafts(
  server: Realm,
  signal?: AbortSignal,
): Promise<SavedCraft[]> {
  const response = await safeApiCall(() =>
    apiClient.GET('/me/saved-crafts', {
      params: { query: { server } },
      signal,
    }),
  )
  return response.data as SavedCraft[]
}

export async function createSavedCraft(input: SavedCraftCreate): Promise<SavedCraft> {
  const response = await safeApiCall(() =>
    apiClient.POST('/me/saved-crafts', { body: input }),
  )
  return response.data as SavedCraft
}

export async function deleteSavedCraft(id: string): Promise<void> {
  await safeApiCall(() =>
    apiClient.DELETE('/me/saved-crafts/{saved_craft_id}', {
      params: { path: { saved_craft_id: id } },
    }),
  )
}
