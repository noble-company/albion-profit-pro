import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'

import { parseSortParam, type SortDirection, type SortField } from './service'

/**
 * Fonte única dos defaults de filtro das telas de oportunidade (F05, task 3.5/20). Antes cada
 * tela declarava os seus, e o `profit_only` já tinha divergido — desligado no Market Flip,
 * ligado em Refino/Craft. Decisão da task: **ligado nas três** (esconde oportunidade negativa
 * por padrão, consistente com a ordenação padrão `profit_desc` e com o propósito do produto).
 */
export const OPPORTUNITY_DEFAULTS = {
  freshnessHours: 6,
  pageSize: 25,
  profitOnly: true,
  premium: true,
  sort: 'profit_desc',
} as const

function numeric(params: URLSearchParams, key: string): number | undefined {
  const raw = params.get(key)
  return raw ? Number(raw) : undefined
}

function numericList(params: URLSearchParams, key: string): number[] {
  return params.getAll(key).map(Number).filter(Number.isFinite)
}

export type SharedOpportunityQuery = {
  buyLocations: string[]
  sellLocations: string[]
  tiers: number[]
  enchantments: number[]
  qualities: number[]
  maxAgeHours: number
  requireComplete: boolean
  limit: number
  offset: number
  minProfit?: string
  minRoi?: string
  profitOnly: boolean
  premium: boolean
  sort: SortField
  direction: SortDirection
}

function readShared(params: URLSearchParams): SharedOpportunityQuery {
  const legacyLocations = params.getAll('location_id')
  return {
    buyLocations: params.has('buy_in')
      ? params.getAll('buy_in')
      : legacyLocations,
    sellLocations: params.has('sell_in')
      ? params.getAll('sell_in')
      : legacyLocations,
    tiers: numericList(params, 'tier'),
    enchantments: numericList(params, 'enchantment'),
    qualities: numericList(params, 'quality'),
    maxAgeHours:
      numeric(params, 'freshness') ?? OPPORTUNITY_DEFAULTS.freshnessHours,
    requireComplete: params.get('coverage') === 'complete',
    limit: OPPORTUNITY_DEFAULTS.pageSize,
    offset: Math.max(0, Number(params.get('offset') || 0)),
    minProfit: params.get('min_profit') || undefined,
    minRoi: params.get('min_roi') || undefined,
    profitOnly: params.get('profit_only') !== 'false',
    premium: params.get('premium') !== 'false',
    ...parseSortParam(params.get('sort')),
  }
}

/**
 * Sincronia entre a URL e o estado das telas de oportunidade, num lugar só.
 *
 * - `query`: os filtros compartilhados + os que a tela lê via `readExtra` (categoria no Flip,
 *   retorno/estação/foco na produção). Passe um `readExtra` **estável** (função de módulo).
 * - `setFilter(key, value)`: muda um filtro e volta pra primeira página (`offset` sai da URL).
 * - `setOffset(n)`: pagina preservando todo o resto — antes o `updateParam` compartilhado
 *   apagava `offset` em toda escrita, o que deixava os botões de paginação sem efeito.
 */
export function useOpportunityParams<Extra extends object>(
  readExtra: (params: URLSearchParams) => Extra,
) {
  const [params, setParams] = useSearchParams()

  const query = useMemo(
    () => ({ ...readShared(params), ...readExtra(params) }),
    [params, readExtra],
  )
  const sortParam = params.get('sort') || OPPORTUNITY_DEFAULTS.sort

  const setFilter = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params)
      if (value) next.set(key, value)
      else next.delete(key)
      next.delete('offset')
      setParams(next)
    },
    [params, setParams],
  )

  const setOffset = useCallback(
    (offset: number) => {
      const next = new URLSearchParams(params)
      if (offset > 0) next.set('offset', String(offset))
      else next.delete('offset')
      setParams(next)
    },
    [params, setParams],
  )

  const setListFilter = useCallback(
    (
      key: 'buy_in' | 'sell_in' | 'tier' | 'enchantment' | 'quality',
      values: readonly (string | number)[],
    ) => {
      const next = new URLSearchParams(params)
      if (
        (key === 'buy_in' || key === 'sell_in') &&
        params.has('location_id')
      ) {
        const legacy = params.getAll('location_id')
        next.delete('location_id')
        if (!params.has('buy_in'))
          legacy.forEach((id) => next.append('buy_in', id))
        if (!params.has('sell_in'))
          legacy.forEach((id) => next.append('sell_in', id))
      }
      next.delete(key)
      values.forEach((value) => next.append(key, String(value)))
      next.delete('offset')
      setParams(next)
    },
    [params, setParams],
  )

  const reset = useCallback(() => setParams(new URLSearchParams()), [setParams])

  return {
    params,
    query,
    sortParam,
    setFilter,
    setListFilter,
    setOffset,
    reset,
  }
}
