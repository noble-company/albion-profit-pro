import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { queryPolicies } from '@/api'

import { readCachedCatalog, writeCachedCatalog } from './cache'
import { getRecipeCatalog, type CatalogKind, type RecipeCatalog } from './service'

export const catalogQueryKey = (kind: CatalogKind) =>
  ['catalog', 'recipes', kind ?? 'all'] as const

/**
 * Catálogo de receitas com *stale-while-revalidate* que sobrevive ao F5 (task 4/07).
 *
 * O cache do TanStack Query é em memória e morre a cada recarga; o scanner é uma tela que se
 * recarrega muito, e não calcula nada sem o catálogo. O IndexedDB entra como `initialData` com
 * `initialDataUpdatedAt` no passado — a query pinta na hora com o que está em disco e revalida
 * em segundo plano.
 *
 * `cacheReady` diz se a leitura do disco já terminou. Sem ele o primeiro render mostraria
 * "carregando" por um frame mesmo tendo cache, que é justamente o que esta task remove.
 */
export function useRecipeCatalog(kind: CatalogKind) {
  // O `kind` viaja junto do payload em vez de num `setCacheReady(false)` no topo do efeito:
  // aquilo é um setState síncrono dentro de efeito, que dispara render em cascata. Guardando
  // o `kind` lido, "pronto" vira uma comparação derivada, sem estado extra.
  const [entry, setEntry] = useState<{
    kind: CatalogKind
    payload: RecipeCatalog | null
  } | null>(null)

  useEffect(() => {
    let active = true
    void readCachedCatalog(kind).then((found) => {
      if (active) setEntry({ kind, payload: found?.payload ?? null })
    })
    return () => {
      active = false
    }
  }, [kind])

  const cacheReady = entry !== null && entry.kind === kind
  const cached = cacheReady ? entry.payload : null

  const query = useQuery({
    queryKey: catalogQueryKey(kind),
    queryFn: async ({ signal }) => {
      const payload = await getRecipeCatalog(kind, signal)
      void writeCachedCatalog(kind, payload)
      return payload
    },
    // Só monta a query depois de saber o que há em disco: assim o `initialData` não chega
    // tarde demais para evitar o estado de carregamento.
    enabled: cacheReady,
    initialData: cached ?? undefined,
    // Marca o dado de disco como velho, para a revalidação disparar de imediato.
    initialDataUpdatedAt: cached ? 0 : undefined,
    ...queryPolicies.catalog,
  })

  // Uma fonte só, de propósito: o `initialData` semeia o cache do TanStack Query com o que veio
  // do disco, e daí em diante `query.data` é a única verdade. Manter também um fallback
  // `?? cached` faria dois mecanismos entregarem o mesmo conteúdo — e nenhum teste conseguiria
  // dizer qual dos dois está realmente sustentando o comportamento.
  return {
    catalog: query.data ?? null,
    /** só é verdade quando não há nada para mostrar — com cache, nunca */
    loading: !cacheReady || (query.isLoading && query.data === undefined),
    error: query.error,
    /** revalidando por trás, com conteúdo já na tela */
    revalidating: query.isFetching && query.data !== undefined,
  }
}
