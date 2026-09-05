import { useMemo } from 'react'

import { useLocations } from '@/prices/hooks'

/**
 * Fonte única do nome de uma cidade: a tabela `location` no backend, via `/locations`
 * (task 3.5/19, F06). Nada de mapa `location_id → nome` no cliente.
 *
 * Devolve uma função de lookup. `display_name` já vem do backend como `name || location_id`
 * — nunca um nome inventado. Se o ID não estiver no catálogo, mostra o **próprio ID**, nunca
 * um literal como "Mercado": esconder que apareceu uma localização desconhecida é pior que
 * mostrar o código.
 */
export function useLocationName(): (
  locationId: string | null | undefined,
) => string {
  const locations = useLocations()
  return useMemo(() => {
    const byId = new Map(locations.map((l) => [l.location_id, l.display_name]))
    return (locationId) => {
      if (!locationId) return '—'
      return byId.get(locationId) ?? locationId
    }
  }, [locations])
}

export type MarketToggle = { name: string; ids: string[] }

/**
 * Cidades para os botões de filtro do Market Flip, agrupadas por nome — o caso Lymhurst
 * (`1002` mercado principal + `1301` cluster do portal) tem os dois IDs com o mesmo `name`
 * no banco, então o agrupamento vem do dado, não de uma lista no componente. Ordem = a que
 * o `/locations` já devolve (cidade real primeiro, depois nome).
 */
export function useMarketToggles(): MarketToggle[] {
  const locations = useLocations()
  return useMemo(() => {
    const byName = new Map<string, MarketToggle>()
    for (const loc of locations) {
      if (loc.kind !== 'city') continue
      const existing = byName.get(loc.display_name)
      if (existing) existing.ids.push(loc.location_id)
      else
        byName.set(loc.display_name, {
          name: loc.display_name,
          ids: [loc.location_id],
        })
    }
    return [...byName.values()]
  }, [locations])
}
