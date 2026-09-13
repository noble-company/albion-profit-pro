import { useMemo } from 'react'

import type { components } from '@/api/schema'
import { useLocations } from '@/prices/hooks'

type LocationOut = components['schemas']['LocationOut']

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

export interface Cidade {
  /** id canônico do grupo — o menor id, escolha estável; é ele que vira a linha da tabela */
  id: string
  name: string
  /** todos os mercados que **são** a mesma cidade */
  ids: string[]
}

export type MarketToggle = Cidade

/**
 * Agrupa mercados que são a mesma cidade (task 4/11.2.2).
 *
 * Lymhurst tem dois `location_id` na tabela `location` (`1002` e `1301`, ver a migração
 * `f2d7e8f9a0b1`) com o mesmo nome. Tratá-los como mercados distintos duplica a cidade no
 * filtro e, pior, deixa o preço capturado num deles invisível no outro.
 *
 * O agrupamento é **pelo nome vindo do banco**, não por uma lista no cliente: nome igual, mesma
 * cidade. É isso que mantém o Black Market (`3003`) separado de Caerleon (`3005`) — nomes
 * diferentes, livros diferentes, preços diferentes.
 *
 * `somenteNomeadas` descarta id sem nome. O ingest cria linha em `location` para todo id
 * desconhecido que aparece numa captura (`4000`, por exemplo); como chip de filtro isso vira um
 * botão chamado "4000", que não é cidade nenhuma que o jogador possa escolher.
 */
export function agruparCidades(
  locations: LocationOut[],
  somenteNomeadas = false,
): Cidade[] {
  const byName = new Map<string, Cidade>()
  for (const loc of locations) {
    if (loc.kind !== 'city') continue
    if (somenteNomeadas && !loc.name) continue
    const existing = byName.get(loc.display_name)
    if (existing) {
      existing.ids = [...existing.ids, loc.location_id].sort()
      existing.id = existing.ids[0] as string
    } else {
      byName.set(loc.display_name, {
        id: loc.location_id,
        name: loc.display_name,
        ids: [loc.location_id],
      })
    }
  }
  return [...byName.values()]
}

/**
 * Cidades para os botões de filtro do Market Flip. Ordem = a que o `/locations` já devolve
 * (cidade real primeiro, depois nome).
 */
export function useMarketToggles(): MarketToggle[] {
  const locations = useLocations()
  return useMemo(() => agruparCidades(locations), [locations])
}

/**
 * Cidades para o scanner: só as que têm nome, cada uma com todos os seus mercados. O `useMemo`
 * não é cosmético — sem ele a lista nasce nova a cada render e o scanner inteiro recalcula.
 */
export function useCidades(): Cidade[] {
  const locations = useLocations()
  return useMemo(() => agruparCidades(locations, true), [locations])
}
