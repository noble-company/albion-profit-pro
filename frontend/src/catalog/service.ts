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
      // Sempre condicional. O servidor manda `max-age=300`, e dentro dele o navegador devolvia o
      // corpo guardado sem perguntar — um campo novo no catálogo (`shop_subcategory2`, task 4/21)
      // levava até 5 minutos para chegar, mesmo com F5. Com `no-cache` o `ETag` é sempre
      // comparado: 304 barato quando nada mudou. O primeiro paint continua vindo do IndexedDB.
      cache: 'no-cache',
    }),
  )
  return response.data as RecipeCatalog
}
