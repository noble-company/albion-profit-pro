import { add, divide, money } from '@/lib/money'

import { priceKey, type PriceIndex, type PriceSide } from './prices'

/**
 * De onde vem cada preço (task 4/11.3, estendida à venda na 4/24).
 *
 * Até a 11.3 o engine cotava **ingrediente e saída na mesma cidade** da linha. Isso descreve um
 * jogador que compra, refina e vende sem sair do lugar — não é como se refina de verdade, e
 * transformava "não observamos a fibra em Martlock" em "essa receita não dá lucro em Martlock",
 * que é outra afirmação.
 *
 * A ordem de precedência é **do mais específico para o mais geral**, e cada degrau é uma
 * escolha explícita de quem está olhando a tela:
 *
 *   1. preço na mão para aquele item            → o jogador já sabe por quanto compra/vende
 *   2. origem escolhida para aquele item        → uma cidade, ou a média das cidades filtradas
 *   3. o padrão (média de Comprar em / a cidade de cada linha de Vender em)
 *
 * **A escolha é por item, não por receita.** Quem marca Fort Sterling para a Fibra T5 está dizendo
 * onde compra fibra T5, e isso vale em toda receita que a use.
 */

/** Valor de "média" numa escolha por item — `pc=T4_FIBER:media`, `sc=T4_CLOTH:media`. */
export const ORIGEM_MEDIA = 'media'

/** Onde a base global busca preço de ingrediente quando não há escolha para o item. */
export type PriceBasis =
  | { kind: 'average' }
  | { kind: 'city'; locationId: string }
  /**
   * Cota o ingrediente na mesma cidade em que o item é vendido. **Não aparece mais na tela**
   * (task 24), mas fica: é assim que o servidor cota no `simulate_craft`, e os vetores dourados
   * (task 06) travam o cliente contra ele nesse modo.
   */
  | { kind: 'sale_city' }

export interface PricingPolicy {
  base: PriceBasis
  /** item → preço decimal digitado; vale nos dois lados (não existe spread num número na mão) */
  manual: Map<string, string>
  /** item → `location_id` de onde cotar aquele ingrediente, ou `ORIGEM_MEDIA` */
  byItemCity: Map<string, string>
  /**
   * Preço de **venda** na mão, por item de saída (task 11.4). Separado de `manual` de propósito:
   * um item pode ser ingrediente de uma receita e saída de outra, e "compro fibra por 250" não
   * é a mesma afirmação que "vendo fibra por 250".
   */
  manualSale: Map<string, string>
  /**
   * Origem da **venda** escolhida por item de saída (task 24): um `location_id`, que vence o
   * filtro de Vender em, ou `ORIGEM_MEDIA`, a média das cidades de Vender em.
   */
  saleByItem: Map<string, string>
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
  saleByItem: new Map(),
}

/** De onde vem o preço de um item, num lado — a mesma escolha que o painel mostra e edita. */
export type Origem =
  | { tipo: 'padrao' }
  | { tipo: 'media' }
  | { tipo: 'cidade'; locationId: string }
  | { tipo: 'fixo'; valor: string }

/** Lê a escolha atual de um item, na mesma precedência em que o engine a aplica. */
export function origemDoItem(
  policy: PricingPolicy,
  lado: 'compra' | 'venda',
  item: string,
): Origem {
  const fixo = (lado === 'compra' ? policy.manual : policy.manualSale).get(item)
  if (fixo !== undefined && fixo !== '') return { tipo: 'fixo', valor: fixo }

  const escolha = (lado === 'compra' ? policy.byItemCity : policy.saleByItem).get(item)
  if (escolha === ORIGEM_MEDIA) return { tipo: 'media' }
  if (escolha) return { tipo: 'cidade', locationId: escolha }
  return { tipo: 'padrao' }
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
  /** ingrediente é sempre qualidade 1; a saída é cotada na qualidade pedida */
  quality = 1,
): ResolvedPrice {
  const entry = prices.get(priceKey(item, locationId, quality, enchantmentLevel))
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
  { quality = 1, lado = 'compra' }: { quality?: number; lado?: 'compra' | 'venda' } = {},
): ResolvedPrice {
  // A média de um item é a mesma para toda linha que o usa — sem cache ela seria refeita uma
  // vez por (receita × cidade × ingrediente). No refino isso é irrelevante; nas 5.523 receitas
  // do craft (task 12) seriam mais de um milhão de varreduras.
  //
  // O lado entra na chave (task 24): o mesmo item pode ser ingrediente de uma receita e saída
  // de outra, e as duas médias varrem conjuntos de cidades diferentes — Comprar em e Vender em.
  const chave = `${lado}|${item}|${enchantmentLevel}|${quality}`
  const guardado = cache?.get(chave)
  if (guardado) return guardado

  const lados = { sell: [] as PriceSide[], buy: [] as PriceSide[] }

  for (const locationId of locations) {
    const entry = prices.get(priceKey(item, locationId, quality, enchantmentLevel))
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
 * Preço da **saída** (task 11.4, com a escolha por item da 24).
 *
 * Sem escolha, ele vem da cidade da linha — é lá que o item é vendido. Com escolha, a cidade da
 * linha deixa de mandar: preço na mão, uma cidade fixa, ou a média das cidades de Vender em.
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
  /** as cidades de Vender em — a base da média, quando ela é a escolha do item */
  saleLocations: string[] = [output.locationId],
  cacheDaMedia?: Map<string, ResolvedPrice>,
): ResolvedPrice {
  const fixado = policy.manualSale.get(output.item)
  if (fixado !== undefined && fixado !== '') {
    const lado = naMao(fixado)
    return { sell: lado, buy: lado }
  }

  const escolha = policy.saleByItem.get(output.item)
  if (escolha === ORIGEM_MEDIA) {
    // Na qualidade da SAÍDA. A média de ingrediente fixa qualidade 1, o que está certo para
    // ingrediente; aqui o jogador vende a qualidade que pediu, e a média tem que ser dela.
    return media(prices, output.item, saleLocations, output.enchantmentLevel, cacheDaMedia, {
      quality: output.quality,
      lado: 'venda',
    })
  }
  if (escolha) {
    return deCidade(prices, output.item, escolha, output.enchantmentLevel, output.quality)
  }

  return deCidade(
    prices,
    output.item,
    output.locationId,
    output.enchantmentLevel,
    output.quality,
  )
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

  const escolha = policy.byItemCity.get(item)
  // A média escolhida no item vence qualquer base — inclusive a de um link antigo com
  // `ing_price=<cidade>`. `locations` são as cidades de Comprar em (task 24).
  if (escolha === ORIGEM_MEDIA) {
    return media(prices, item, locations, enchantmentLevel, cacheDaMedia)
  }
  if (escolha) return deCidade(prices, item, escolha, enchantmentLevel)

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
