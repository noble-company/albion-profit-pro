import { useEffect, useState } from 'react'
import { searchItems, type CatalogItem, type SearchFilters } from './service'
export function useBuscaItens(query: string, filters: SearchFilters) {
  const [data, setData] = useState<CatalogItem[]>([])
  const [isLoading, setLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const normalized = query.trim()
  useEffect(() => {
    if (normalized.length < 2) {
      return
    }
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setLoading(true)
      setError(null)
      void searchItems(normalized, filters, controller.signal)
        .then(setData)
        .catch((reason) => {
          if (!controller.signal.aborted) {
            setError(reason)
            setData([])
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false)
        })
    }, 300)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [
    normalized,
    filters.apenas_craftaveis,
    filters.categoria,
    filters.enchantment_level,
    filters.tier,
    filters,
  ])
  return {
    data: normalized.length < 2 ? [] : data,
    isLoading: normalized.length < 2 ? false : isLoading,
    error: normalized.length < 2 ? null : error,
    needsMore: normalized.length > 0 && normalized.length < 2,
  }
}
