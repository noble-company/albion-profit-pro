import { add, divide, money } from '@/lib/money'

import { priceKey, type PriceIndex, type PriceSide } from './prices'

/**
 * De onde vem o preço de cada ingrediente (task 4/11.3).
 *
 * Até aqui o engine cotava **ingrediente e saída na mesma cidade** da linha. Isso descreve um
 * jogador que compra, refina e vende sem sair do lugar — não é como se refina de verdade, e
 * transformava "não observamos a fibra em Martlock" em "essa receita não dá lucro em Martlock",
 * que é outra afirmação.
 *
 * A ordem de precedência é **do mais específico para o mais geral**, e cada degrau é uma
 * escolha explícita de quem está olhando a tela:
 *
 *   1. preço na mão para aquele item      → o jogador já sabe por quanto compra
 *   2. cidade fixa para aquele item       → "essa fibra eu sempre pego em Fort Sterling"
 *   3. base global (média / cidade / venda)
 */

/** Onde a base global busca preço quando não há exceção para o item. */
export type PriceBasis =
  | { kind: 'average' }
  | { kind: 'city'; locationId: string }
  /** o comportamento antigo: cota o ingrediente na mesma cidade em que o item é vendido */
  | { kind: 'sale_city' }

export interface PricingPolicy {
  base: PriceBasis
  /** item → preço decimal digitado; vale nos dois lados (não existe spread num número na mão) */
  manual: Map<string, string>
  /** item → `location_id` de onde cotar aquele item */
  byItemCity: Map<string, string>
  /**
   * Preço de **venda** na mão, por item de saída (task 11.4). Separado de `manual` de propósito:
   * um item pode ser ingrediente de uma receita e saída de outra, e "compro fibra por 250" não
   * é a mesma afirmação que "vendo fibra por 250".
   */
  manualSale: Map<string, string>
}

/**
 * Média das cidades por padrão. É o que a maioria de quem refina usa: comprar 3.000 fibras
 * numa cidade só move o preço daquela cidade, então a média descreve melhor a compra real do
 * que o topo de livro de um mercado.
 */
export const DEFAULT_PRICING: PricingPolicy = {
  base: { kind: 'average' },
  manual: new Map(),
  byItemCity: new Map(),
  manualSale: new Map(),
}

/** Um lado cotado. `observedAt` nulo = número digitado, que não tem idade. */
export interface ResolvedSide {
  price: string
  observedAt: number | null
  source: string
}

export interface ResolvedPrice {
  sell: ResolvedSide | null
  buy: ResolvedSide | null
}

const VAZIO: ResolvedPrice = { sell: null, buy: null }

function paraLado(side: PriceSide | null): ResolvedSide | null {
  return side === null
    ? null
    : { price: side.price, observedAt: side.observedAt, source: side.source }
}

function deCidade(
  prices: PriceIndex,
  item: string,
  locationId: string,
  enchantmentLevel: number,
): ResolvedPrice {
  const entry = prices.get(priceKey(item, locationId, 1, enchantmentLevel))
  return { sell: paraLado(entry?.sell ?? null), buy: paraLado(entry?.buy ?? null) }
}

/**
 * Média aritmética das cidades **que têm preço**. Ausência não entra como zero: isso inventaria
 * uma cidade vendendo de graça e puxaria a média para baixo em cima de um buraco do snapshot.
 *
 * A idade herdada é a da observação **mais velha** que entrou na média — ela é tão confiável
 * quanto a pior das partes.
 */
function media(
  prices: PriceIndex,
  item: string,
  locations: string[],
  enchantmentLevel: number,
  cache?: Map<string, ResolvedPrice>,
): ResolvedPrice {
  // A média de um item é a mesma para toda linha que o usa — sem cache ela seria refeita uma
  // vez por (receita × cidade × ingrediente). No refino isso é irrelevante; nas 5.523 receitas
  // do craft (task 12) seriam mais de um milhão de varreduras.
  const chave = `${item}|${enchantmentLevel}`
  const guardado = cache?.get(chave)
  if (guardado) return guardado

  const lados = { sell: [] as PriceSide[], buy: [] as PriceSide[] }

  for (const locationId of locations) {
    const entry = prices.get(priceKey(item, locationId, 1, enchantmentLevel))
    if (entry?.sell) lados.sell.push(entry.sell)
    if (entry?.buy) lados.buy.push(entry.buy)
  }

  const medio = (partes: PriceSide[]): ResolvedSide | null => {
    if (partes.length === 0) return null
    const soma = add(...partes.map((parte) => parte.price))
    return {
      price: divide(soma, partes.length).toString(),
      observedAt: Math.min(...partes.map((parte) => parte.observedAt)),
      source: `média de ${partes.length}`,
    }
  }

  const resultado = { sell: medio(lados.sell), buy: medio(lados.buy) }
  cache?.set(chave, resultado)
  return resultado
}

/** Preço na mão como lado cotado: mesmo número dos dois lados, sem idade. */
function naMao(valor: string): ResolvedSide {
  return { price: money(valor).toString(), observedAt: null, source: 'manual' }
}

/**
 * Preço da **saída** (task 11.4). Diferente do ingrediente, ele continua vindo da cidade da
 * linha — é lá que o item é vendido, e é essa a pergunta que a coluna `Cidade` responde. A
 * única exceção é o preço na mão: "eu vendo esse tecido por 1.200".
 */
export function resolveOutputPrice(
  prices: PriceIndex,
  policy: PricingPolicy,
  output: {
    item: string
    quality: number
    enchantmentLevel: number
    locationId: string
  },
): ResolvedPrice {
  const fixado = policy.manualSale.get(output.item)
  if (fixado !== undefined && fixado !== '') {
    const lado = naMao(fixado)
    return { sell: lado, buy: lado }
  }

  const entry = prices.get(
    priceKey(output.item, output.locationId, output.quality, output.enchantmentLevel),
  )
  return { sell: paraLado(entry?.sell ?? null), buy: paraLado(entry?.buy ?? null) }
}

export function resolveIngredientPrice(
  prices: PriceIndex,
  policy: PricingPolicy,
  locations: string[],
  ingredient: { item: string; enchantmentLevel: number; saleLocationId: string },
  /** memória da média entre chamadas; só a média cabe aqui, por não depender da cidade de venda */
  cacheDaMedia?: Map<string, ResolvedPrice>,
): ResolvedPrice {
  const { item, enchantmentLevel, saleLocationId } = ingredient

  const fixado = policy.manual.get(item)
  if (fixado !== undefined && fixado !== '') {
    // O mesmo número nos dois lados de propósito: quem digita "pago 250 na fibra" está dizendo
    // o custo dele, não um livro de ofertas com spread.
    const lado = naMao(fixado)
    return { sell: lado, buy: lado }
  }

  const cidadeDoItem = policy.byItemCity.get(item)
  if (cidadeDoItem) return deCidade(prices, item, cidadeDoItem, enchantmentLevel)

  switch (policy.base.kind) {
    case 'city':
      return deCidade(prices, item, policy.base.locationId, enchantmentLevel)
    case 'sale_city':
      return deCidade(prices, item, saleLocationId, enchantmentLevel)
    case 'average':
      return media(prices, item, locations, enchantmentLevel, cacheDaMedia)
    default:
      return VAZIO
  }
}
