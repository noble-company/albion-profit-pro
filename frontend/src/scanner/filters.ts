import type { components } from '@/api/schema'
import { compare, money, type Money } from '@/lib/money'

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
  /** Vende/dia mínimo, string decimal — aplicado por `filtrarPorVolume`, não por `applyFilters` */
  minVolume: string | null
  /** Nasce **ligado**, como `showUnpriced`: item sem histórico de venda aparece por padrão */
  showWithoutSales: boolean
}

export const DEFAULT_FILTERS: ScannerFilters = {
  search: '',
  tiers: [],
  enchantments: [],
  minProfit: null,
  minRoi: null,
  maxAgeHours: null,
  showUnpriced: true,
  profitableOnly: false,
  minVolume: null,
  showWithoutSales: true,
}

/** Unidades vendidas por dia de uma linha; `null` = sem histórico. Ver `volumeDaVenda`. */
export type VolumeDaLinha = (row: ScannerRow) => Money | null

/**
 * Vende/dia mínimo (pedido no uso, 2026-09-12).
 *
 * Fora de `applyFilters` porque o volume não está na linha: vem do histórico de vendas
 * (`GET /prices/sales`) e depende das cidades de Vender em — é o mesmo número da coluna.
 *
 * Item **sem histórico continua aparecendo** por padrão — decisão do jogador: ausência de
 * histórico não é zero vendido, e ele prefere olhar a linha a perdê-la. Esconder é a caixa
 * "Mostrar sem volume de vendas", no mesmo formato de "Mostrar sem preço". Vale com ou sem preço,
 * porque volume é fato do mercado, não do cálculo. Enquanto as vendas não chegam (`volumeDe`
 * nulo), nada é filtrado: sem o índice toda linha pareceria sem histórico, e a tabela piscaria vazia.
 */
export function filtrarPorVolume(
  rows: ScannerRow[],
  { minVolume, showWithoutSales }: Pick<ScannerFilters, 'minVolume' | 'showWithoutSales'>,
  volumeDe: VolumeDaLinha | null,
): ScannerRow[] {
  if (volumeDe === null || (minVolume === null && showWithoutSales)) return rows
  const minimo = minVolume === null ? null : money(minVolume)
  return rows.filter((row) => {
    const volume = volumeDe(row)
    if (volume === null) return showWithoutSales
    return minimo === null || compare(volume, minimo) >= 0
  })
}

/**
 * A busca por texto: o código, o nome em português ou em inglês. `termo` já chega em minúsculas.
 * Exportada porque a busca também **seleciona** o que é calculado (task 21) — as duas perguntas
 * precisam casar do mesmo jeito, senão a tela calcularia uma receita e esconderia a mesma.
 */
export function casaBusca(item: CatalogItem | undefined, outputItem: string, termo: string) {
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
    if (termo && !casaBusca(item, row.outputItem, termo)) return false
    if (filters.tiers.length > 0 && !filters.tiers.includes(item?.tier ?? -1)) {
      return false
    }
    if (
      filters.enchantments.length > 0 &&
      !filters.enchantments.includes(item?.enchantment_level ?? 0)
    ) {
      return false
    }

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
