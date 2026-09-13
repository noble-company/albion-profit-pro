import type { components } from '@/api/schema'

/**
 * Índice de preço a partir do payload colunar de `GET /prices/snapshot` (task 4/03).
 *
 * O formato da rede é colunar porque array de objetos custava 67 KB por cidade — caro demais
 * para algo buscado a cada 30 s. Aqui ele é desfeito **uma vez** num `Map`, e o engine consulta
 * em O(1) durante as ~22 mil avaliações de cenário.
 */

export type PriceSnapshotOut = components['schemas']['PriceSnapshotOut']

export type PriceSide = {
  /** string decimal — nunca `number` (`F09`) */
  price: string
  /** epoch em segundos */
  observedAt: number
  source: string
}

export interface PriceEntry {
  /** menor `offer`: o que se paga comprando agora */
  sell: PriceSide | null
  /** maior `request`: o que se recebe vendendo agora */
  buy: PriceSide | null
}

export type PriceIndex = Map<string, PriceEntry>

/** Chave do índice. Enchantment entra separado porque o snapshot o guarda separado, mesmo o
 * `item_id` já trazendo o sufixo `@N`. */
export function priceKey(
  itemId: string,
  locationId: string,
  quality: number,
  enchantment: number,
): string {
  return `${itemId}|${locationId}|${quality}|${enchantment}`
}

/**
 * `canonical` funde mercados que são a mesma cidade (task 11.2.2): Lymhurst chega como `1002`
 * e `1301`, e sem fundir os dois o preço capturado num deles fica invisível no outro.
 *
 * Quando dois ids caem na mesma chave, **a observação mais recente vence, por lado** — a mesma
 * regra que o backend aplica entre `client` e `aodp` (`prices/snapshot.py`). Decidir pela ordem
 * de chegada das linhas faria o resultado depender do `ORDER BY` do endpoint.
 */
export function buildPriceIndex(
  snapshot: PriceSnapshotOut,
  canonical: (locationId: string) => string = (id) => id,
): PriceIndex {
  const index: PriceIndex = new Map()
  const c = snapshot.columns

  const maisNovo = (atual: PriceSide | null, novo: PriceSide | null): PriceSide | null => {
    if (novo === null) return atual
    if (atual === null) return novo
    return novo.observedAt > atual.observedAt ? novo : atual
  }

  const side = (
    price: string | null | undefined,
    observedAt: number | null | undefined,
    sourceIndex: number | null | undefined,
  ): PriceSide | null =>
    price == null || observedAt == null
      ? null
      : {
          price,
          observedAt,
          source: snapshot.sources[sourceIndex ?? 0] ?? 'unknown',
        }

  for (let i = 0; i < snapshot.row_count; i += 1) {
    const itemIndex = c.item[i]
    const locationIndex = c.location[i]
    const quality = c.quality[i]
    const enchantment = c.enchantment[i]
    if (
      itemIndex === undefined ||
      locationIndex === undefined ||
      quality === undefined ||
      enchantment === undefined
    ) {
      continue
    }

    const itemId = snapshot.items[itemIndex]
    const locationId = snapshot.locations[locationIndex]
    if (itemId === undefined || locationId === undefined) continue

    const key = priceKey(itemId, canonical(locationId), quality, enchantment)
    const atual = index.get(key)
    const sell = side(c.sell_min[i], c.sell_observed_at[i], c.sell_source[i])
    const buy = side(c.buy_max[i], c.buy_observed_at[i], c.buy_source[i])

    index.set(
      key,
      atual === undefined
        ? { sell, buy }
        : { sell: maisNovo(atual.sell, sell), buy: maisNovo(atual.buy, buy) },
    )
  }

  return index
}
