import { apiClient, safeApiCall } from '@/api'
import type { components } from '@/api/schema'

export type RecipeCatalog = components['schemas']['CatalogRecipesOut']
export type CatalogKind = 'refining' | 'crafting' | null

/**
 * Catálogo estático de receitas (task 4/02). **Sem paginação e sem preço** — o cliente recebe
 * o catálogo inteiro e decide sozinho o que mostrar. É a diferença entre 5.633 receitas e "as
 * que já tinham preço".
 */
export async function getRecipeCatalog(
  kind: CatalogKind,
  signal?: AbortSignal,
): Promise<RecipeCatalog> {
  const response = await safeApiCall(() =>
    apiClient.GET('/catalog/recipes', {
      params: { query: kind ? { kind } : {} },
      signal,
    }),
  )
  return response.data as RecipeCatalog
}
