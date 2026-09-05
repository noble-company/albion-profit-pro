import { useQuery } from '@tanstack/react-query'

import { queryPolicies } from '@/api'
import { useDebouncedValue } from '@/lib/useDebouncedValue'

import { searchItems, type SearchFilters } from './service'

export function useBuscaItens(query: string, filters: SearchFilters) {
  const normalized = query.trim()
  // Debounça o texto, não a query: a chave já muda pelo conteúdo de `filters`, então um
  // re-render do pai que recria o objeto `filters` não reinicia o debounce (task 3.5/15,
  // item 6 — hoje reinicia porque `filters` está no array de dependências do useEffect).
  const debounced = useDebouncedValue(normalized, 300)
  const enabled = debounced.length >= 2
  const { data, isLoading, error } = useQuery({
    queryKey: ['items', 'search', debounced, filters] as const,
    queryFn: ({ signal }) => searchItems(debounced, filters, signal),
    enabled,
    ...queryPolicies.catalog,
  })
  return {
    data: enabled ? (data ?? []) : [],
    isLoading: enabled ? isLoading : false,
    error: enabled ? error : null,
    needsMore: normalized.length > 0 && normalized.length < 2,
  }
}
