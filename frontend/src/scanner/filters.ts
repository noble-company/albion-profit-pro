import type { components } from '@/api/schema'
import { compare, money } from '@/lib/money'

import type { ScannerRow } from './engine'

/**
 * Filtros do scanner (task 4/09) — predicado sobre um array em memória, não consulta.
 *
 * A diferença não é de implementação, é de produto. Enquanto filtrar era consulta, cada
 * combinação custava um round-trip e o servidor decidia o que existia; por isso `min_profit=0`
 * apagava silenciosamente toda linha sem preço (`X02`) e receita sem mercado nunca aparecia
 * (`X01`). Aqui o conjunto é o catálogo inteiro, já calculado, e filtrar só decide o que
 * **mostrar**.
 */

type CatalogItem = components['schemas']['CatalogItemOut']

export interface ScannerFilters {
  /** nome em pt, en, ou `unique_name` */
  search: string
  /** vazio = todos os tiers (não "nenhum") */
  tiers: number[]
  enchantments: number[]
  category: string | null
  /** string decimal (`F09`), nunca `number` */
  minProfit: string | null
  minRoi: string | null
  /** `null` = sem limite de idade */
  maxAgeHours: number | null
  /**
   * Nasce **ligado**. É a inversão explícita de `X01`/`X02`: o produto mostra tudo, e esconder
   * é escolha do usuário. Antes, o servidor escondia por padrão e não havia como pedir de volta.
   */
  showUnpriced: boolean
  profitableOnly: boolean
}

export const DEFAULT_FILTERS: ScannerFilters = {
  search: '',
  tiers: [],
  enchantments: [],
  category: null,
  minProfit: null,
  minRoi: null,
  maxAgeHours: null,
  showUnpriced: true,
  profitableOnly: false,
}

function matchesSearch(item: CatalogItem | undefined, outputItem: string, termo: string) {
  const alvo = [
    outputItem,
    item?.name_pt ?? '',
    item?.name_en ?? '',
  ]
    .join(' ')
    .toLocaleLowerCase('pt-BR')
  return alvo.includes(termo)
}

export function applyFilters(
  rows: ScannerRow[],
  filters: ScannerFilters,
  itemsByName: Map<string, CatalogItem>,
  now: number = Math.floor(Date.now() / 1000),
): ScannerRow[] {
  const termo = filters.search.trim().toLocaleLowerCase('pt-BR')
  const maxAgeSeconds =
    filters.maxAgeHours === null ? null : filters.maxAgeHours * 3600

  return rows.filter((row) => {
    const item = itemsByName.get(row.outputItem)
    const semPreco = row.state !== 'priced'

    // O checkbox decide primeiro: sem ele ligado, linha sem preço nem entra na conversa.
    if (semPreco && !filters.showUnpriced) return false

    // --- filtros de identidade, valem para linha com ou sem preço ---
    if (termo && !matchesSearch(item, row.outputItem, termo)) return false
    if (filters.tiers.length > 0 && !filters.tiers.includes(item?.tier ?? -1)) {
      return false
    }
    if (
      filters.enchantments.length > 0 &&
      !filters.enchantments.includes(item?.enchantment_level ?? 0)
    ) {
      return false
    }
    if (filters.category && item?.shop_category !== filters.category) return false

    // --- filtros financeiros: só se aplicam a linha COM preço ---
    // Linha sem preço não é "lucro zero" nem "ROI negativo" — é ausência. Excluí-la aqui
    // reproduziria o `X02`, onde `NULL >= min_profit` apagava a linha em silêncio.
    if (semPreco) return true

    if (filters.profitableOnly && (row.profit === null || !row.profit.greaterThan(0))) {
      return false
    }
    if (filters.minProfit !== null && row.profit !== null) {
      if (compare(row.profit, money(filters.minProfit)) < 0) return false
    }
    if (filters.minRoi !== null && row.roi !== null) {
      if (compare(row.roi, money(filters.minRoi)) < 0) return false
    }
    if (maxAgeSeconds !== null) {
      if (row.oldestObservedAt === null) return false
      if (now - row.oldestObservedAt > maxAgeSeconds) return false
    }

    return true
  })
}
