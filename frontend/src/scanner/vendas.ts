import type { components } from '@/api/schema'
import { add, money, type Money } from '@/lib/money'

import type { ScannerRow } from './engine'

/**
 * Quantas unidades vendem por dia (task 4/23).
 *
 * É a melhor ideia do app de referência ("UND/D"): um lucro de +44 mil num item que vende 7 por dia
 * não é lucro. O dado vem de `GET /prices/sales` — a média dos últimos 7 dias completos, lida do
 * rollup diário, que junta o histórico do nosso client e o da API pública.
 */

export type SalesOut = components['schemas']['SalesOut']

/** `item|cidade|qualidade` → unidades por dia. Ausente = sem histórico, nunca zero. */
export type SalesIndex = Map<string, Money>

export function chaveDeVenda(item: string, locationId: string, quality: number): string {
  return `${item}|${locationId}|${quality}`
}

/**
 * Desfaz o formato colunar. O `canonical` é o mesmo do índice de preços: os dois mercados de
 * Lymhurst (`1002` e `1301`) viram uma cidade só — e aqui o volume dos dois **soma**, porque são
 * vendas diferentes, não duas cotações da mesma coisa.
 */
export function buildSalesIndex(
  sales: SalesOut,
  canonical: (locationId: string) => string = (id) => id,
): SalesIndex {
  const indice: SalesIndex = new Map()
  const c = sales.columns
  for (let i = 0; i < sales.row_count; i += 1) {
    const chave = chaveDeVenda(
      sales.items[c.item[i]!]!,
      canonical(sales.locations[c.location[i]!]!),
      c.quality[i]!,
    )
    const valor = money(c.units_per_day[i]!)
    const atual = indice.get(chave)
    indice.set(chave, atual ? atual.plus(valor) : valor)
  }
  return indice
}

/**
 * O volume que a venda da linha pode escoar.
 *
 * Venda **numa cidade**: o volume dela. Venda **pela média** ou **com preço fixo**: não há uma
 * cidade da venda, e o que o jogador consegue escoar é o que as cidades de Vender em vendem juntas.
 * Sem histórico em nenhuma, `null` — nunca zero, que afirmaria que ninguém compra.
 */
export function volumeDaVenda(
  row: Pick<ScannerRow, 'outputItem' | 'locationId' | 'saleBasis'>,
  indice: SalesIndex,
  cidadesDeVenda: readonly string[],
  quality: number,
): Money | null {
  if (row.saleBasis === 'city') {
    return indice.get(chaveDeVenda(row.outputItem, row.locationId, quality)) ?? null
  }
  const partes = cidadesDeVenda
    .map((id) => indice.get(chaveDeVenda(row.outputItem, id, quality)))
    .filter((valor): valor is Money => valor !== undefined)
  return partes.length > 0 ? add(...partes) : null
}

const COMPACTO = new Intl.NumberFormat('pt-BR', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

/** `12400` → `12,4 mil`. Espaço comum, não o inseparável do ICU: cabe igual e busca igual. */
export function formatarVolume(unidades: Money): string {
  return COMPACTO.format(unidades.toNumber()).replace(/\u00a0/g, ' ')
}
