import { add, divide, money } from '@/lib/money'

import { priceKey, type PriceIndex, type PriceSide } from './prices'

/**
 * De onde vem cada preço (task 4/11.3, estendida à venda na 4/24 e à barra na 4/25).
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
 *   2. origem escolhida para aquele item        → uma cidade, a média, o menor, a melhor
 *   3. o padrão da barra                        → Preço de compra / Preço de venda (task 25)
 *
 * **A escolha é por item, não por receita.** Quem marca Fort Sterling para a Fibra T5 está dizendo
 * onde compra fibra T5, e isso vale em toda receita que a use.
 */

/** Valor de "média" numa escolha por item — `pc=T4_FIBER:media`, `sc=T4_CLOTH:media`. */
export const ORIGEM_MEDIA = 'media'

/** A cidade mais barata de Comprar em, como escolha de um ingrediente — `pc=T4_FIBER:menor`. */
export const ORIGEM_MENOR = 'menor'

/**
 * A melhor cidade de Vender em, como escolha de um item de saída — `sc=T4_CLOTH:melhor`. Só faz
 * sentido como exceção: com a barra na média, "melhor cidade" num item é o que foge dela (task 25).
 */
export const ORIGEM_MELHOR = 'melhor'

/** Onde a base global busca preço de ingrediente quando não há escolha para o item. */
export type PriceBasis =
  | { kind: 'average' }
  /** a cidade mais barata de Comprar em, lado a lado (task 25) */
  | { kind: 'cheapest' }
  | { kind: 'city'; locationId: string }
  /**
   * Cota o ingrediente na mesma cidade em que o item é vendido. **Não aparece mais na tela**
   * (task 24), mas fica: é assim que o servidor cota no `simulate_craft`, e os vetores dourados
   * (task 06) travam o cliente contra ele nesse modo.
   */
  | { kind: 'sale_city' }

/** De onde vem o preço de venda de um item sem escolha própria (task 25). */
export type SaleBasis = 'best' | 'average'

export interface PricingPolicy {
  base: PriceBasis
  /**
   * O Preço de venda da barra. Ausente = `best`, a melhor cidade de Vender em — o comportamento de
   * antes da task 25. Opcional por isso: os vetores dourados e os cenários de teste anteriores
   * descrevem a melhor cidade sem precisar dizer.
   */
  saleBase?: SaleBasis
  /** item → preço decimal digitado; vale nos dois lados (não existe spread num número na mão) */
  manual: Map<string, string>
  /** item → `location_id` de onde cotar aquele ingrediente, `ORIGEM_MEDIA` ou `ORIGEM_MENOR` */
  byItemCity: Map<string, string>
  /**
   * Preço de **venda** na mão, por item de saída (task 11.4). Separado de `manual` de propósito:
   * um item pode ser ingrediente de uma receita e saída de outra, e "compro fibra por 250" não
   * é a mesma afirmação que "vendo fibra por 250".
   */
  manualSale: Map<string, string>
  /**
   * Origem da **venda** escolhida por item de saída (task 24): um `location_id`, que vence o
   * filtro de Vender em, `ORIGEM_MEDIA` ou `ORIGEM_MELHOR`.
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
  saleBase: 'best',
  manual: new Map(),
  byItemCity: new Map(),
  manualSale: new Map(),
  saleByItem: new Map(),
}

type Lado = 'compra' | 'venda'

/** De onde vem o preço de um item, num lado — a mesma escolha que o painel mostra e edita. */
export type Origem =
  | { tipo: 'padrao' }
  | { tipo: 'media' }
  | { tipo: 'menor' }
  | { tipo: 'melhor' }
  | { tipo: 'cidade'; locationId: string }
  | { tipo: 'fixo'; valor: string }

/**
 * A escolha gravada para um item, **só se ela existe naquele lado**. `sc=T4_CLOTH:menor` é lixo de
 * URL, não uma cidade chamada "menor": tratar como cidade zeraria o preço da linha em silêncio.
 */
export function escolhaDoItem(
  policy: PricingPolicy,
  lado: Lado,
  item: string,
): string | undefined {
  const escolha = (lado === 'compra' ? policy.byItemCity : policy.saleByItem).get(item)
  const doOutroLado = lado === 'compra' ? ORIGEM_MELHOR : ORIGEM_MENOR
  return escolha === '' || escolha === doOutroLado ? undefined : escolha
}

/** Lê a escolha atual de um item, na mesma precedência em que o engine a aplica. */
export function origemDoItem(policy: PricingPolicy, lado: Lado, item: string): Origem {
  const fixo = (lado === 'compra' ? policy.manual : policy.manualSale).get(item)
  if (fixo !== undefined && fixo !== '') return { tipo: 'fixo', valor: fixo }

  const escolha = escolhaDoItem(policy, lado, item)
  if (escolha === ORIGEM_MEDIA) return { tipo: 'media' }
  if (escolha === ORIGEM_MENOR) return { tipo: 'menor' }
  if (escolha === ORIGEM_MELHOR) return { tipo: 'melhor' }
  if (escolha) return { tipo: 'cidade', locationId: escolha }
  return { tipo: 'padrao' }
}

/**
 * O padrão da barra na língua do seletor do item (task 25). É o que o painel mostra num item sem
 * escolha — e a opção que, escolhida ali, não grava nada.
 */
export function origemPadrao(policy: PricingPolicy, lado: Lado): Origem {
  if (lado === 'venda') {
    return policy.saleBase === 'average' ? { tipo: 'media' } : { tipo: 'melhor' }
  }
  switch (policy.base.kind) {
    case 'cheapest':
      return { tipo: 'menor' }
    case 'city':
      return { tipo: 'cidade', locationId: policy.base.locationId }
    default:
      // `sale_city` não existe mais na tela; um link antigo com ele lê como a média.
      return { tipo: 'media' }
  }
}

/**
 * Quantos itens não seguem a barra num lado: preço fixo ou origem própria, **uma vez por item**
 * (task 25). Mudar a barra não apaga essas escolhas, então a barra precisa dizer que elas existem.
 */
export function itensComEscolhaPropria(policy: PricingPolicy, lado: Lado): number {
  const [fixos, escolhas] =
    lado === 'compra'
      ? [policy.manual, policy.byItemCity]
      : [policy.manualSale, policy.saleByItem]
  return new Set([...fixos.keys(), ...escolhas.keys()]).size
}

/** Um lado cotado. `observedAt` nulo = número digitado, que não tem idade. */
export interface ResolvedSide {
  price: string
  observedAt: number | null
  source: string
  /**
   * A cidade de onde o preço veio, quando veio de **uma** só (task 25). Nula na média e no preço
   * na mão — nenhum dos dois é um mercado.
   */
  locationId: string | null
}

export interface ResolvedPrice {
  sell: ResolvedSide | null
  buy: ResolvedSide | null
}

const VAZIO: ResolvedPrice = { sell: null, buy: null }

function paraLado(side: PriceSide | null, locationId: string): ResolvedSide | null {
  return side === null
    ? null
    : { price: side.price, observedAt: side.observedAt, source: side.source, locationId }
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
  return {
    sell: paraLado(entry?.sell ?? null, locationId),
    buy: paraLado(entry?.buy ?? null, locationId),
  }
}

/**
 * Um preço a partir de várias cidades: a **média** ou o **menor**, só entre as cidades **que têm
 * preço**. Ausência não entra como zero: isso inventaria uma cidade vendendo de graça — que puxaria
 * a média para baixo e seria sempre "o menor".
 *
 * Na média, a idade herdada é a da observação **mais velha** que entrou nela: ela é tão confiável
 * quanto a pior das partes. No menor, é a da cidade escolhida, e a cidade vai junto.
 *
 * Cada lado é resolvido sozinho. A oferta mais barata (compra imediata) e a menor ordem de compra
 * podem estar em cidades diferentes: são duas compras diferentes.
 */
function agregado(
  prices: PriceIndex,
  item: string,
  locations: string[],
  enchantmentLevel: number,
  cache: Map<string, ResolvedPrice> | undefined,
  {
    quality = 1,
    lado = 'compra',
    modo = 'media',
  }: { quality?: number; lado?: Lado; modo?: 'media' | 'menor' } = {},
): ResolvedPrice {
  // O agregado de um item é o mesmo para toda linha que o usa — sem cache ele seria refeito uma
  // vez por (receita × cidade × ingrediente). No refino isso é irrelevante; nas 5.523 receitas
  // do craft (task 12) seriam mais de um milhão de varreduras.
  //
  // O lado entra na chave (task 24): o mesmo item pode ser ingrediente de uma receita e saída
  // de outra, e as duas médias varrem conjuntos de cidades diferentes — Comprar em e Vender em.
  // O modo também (task 25): um item pode estar na média e outro no menor, na mesma conta.
  const chave = `${modo}|${lado}|${item}|${enchantmentLevel}|${quality}`
  const guardado = cache?.get(chave)
  if (guardado) return guardado

  const lados = {
    sell: [] as Array<[string, PriceSide]>,
    buy: [] as Array<[string, PriceSide]>,
  }

  for (const locationId of locations) {
    const entry = prices.get(priceKey(item, locationId, quality, enchantmentLevel))
    if (entry?.sell) lados.sell.push([locationId, entry.sell])
    if (entry?.buy) lados.buy.push([locationId, entry.buy])
  }

  const medio = (partes: Array<[string, PriceSide]>): ResolvedSide | null => {
    if (partes.length === 0) return null
    const soma = add(...partes.map(([, parte]) => parte.price))
    return {
      price: divide(soma, partes.length).toString(),
      observedAt: Math.min(...partes.map(([, parte]) => parte.observedAt)),
      source: `média de ${partes.length}`,
      locationId: null,
    }
  }

  // Empate fica com a primeira cidade na ordem de Comprar em: estável entre recálculos, para a
  // cidade mostrada no painel não trocar sozinha a cada polling.
  const menor = (partes: Array<[string, PriceSide]>): ResolvedSide | null => {
    let escolhido: [string, PriceSide] | null = null
    for (const parte of partes) {
      if (escolhido === null || money(parte[1].price).lessThan(escolhido[1].price)) {
        escolhido = parte
      }
    }
    return escolhido === null ? null : paraLado(escolhido[1], escolhido[0])
  }

  const reduzir = modo === 'menor' ? menor : medio
  const resultado = { sell: reduzir(lados.sell), buy: reduzir(lados.buy) }
  cache?.set(chave, resultado)
  return resultado
}

/** Preço na mão como lado cotado: mesmo número dos dois lados, sem idade e sem cidade. */
function naMao(valor: string): ResolvedSide {
  return { price: money(valor).toString(), observedAt: null, source: 'manual', locationId: null }
}

/**
 * Preço da **saída** (task 11.4, com a escolha por item da 24 e a barra da 25).
 *
 * Sem escolha, a barra decide: a cidade da linha (melhor cidade — é lá que o item é vendido, e
 * `bestPerRecipe` fica com a melhor) ou a média das cidades de Vender em. Com escolha, o item
 * decide: preço na mão, uma cidade fixa, a média, ou de volta à cidade da linha.
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
  /** as cidades de Vender em — a base da média, quando ela é a escolha do item ou da barra */
  saleLocations: string[] = [output.locationId],
  cacheDaMedia?: Map<string, ResolvedPrice>,
): ResolvedPrice {
  const fixado = policy.manualSale.get(output.item)
  if (fixado !== undefined && fixado !== '') {
    const lado = naMao(fixado)
    return { sell: lado, buy: lado }
  }

  // Na qualidade da SAÍDA. A média de ingrediente fixa qualidade 1, o que está certo para
  // ingrediente; aqui o jogador vende a qualidade que pediu, e a média tem que ser dela.
  const pelaMedia = () =>
    agregado(prices, output.item, saleLocations, output.enchantmentLevel, cacheDaMedia, {
      quality: output.quality,
      lado: 'venda',
    })
  const naLinha = () =>
    deCidade(prices, output.item, output.locationId, output.enchantmentLevel, output.quality)

  const escolha = escolhaDoItem(policy, 'venda', output.item)
  if (escolha === ORIGEM_MEDIA) return pelaMedia()
  if (escolha === ORIGEM_MELHOR) return naLinha()
  if (escolha) {
    return deCidade(prices, output.item, escolha, output.enchantmentLevel, output.quality)
  }

  return policy.saleBase === 'average' ? pelaMedia() : naLinha()
}

export function resolveIngredientPrice(
  prices: PriceIndex,
  policy: PricingPolicy,
  locations: string[],
  ingredient: { item: string; enchantmentLevel: number; saleLocationId: string },
  /** memória dos agregados entre chamadas; só eles cabem aqui, por não dependerem da cidade de venda */
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

  // `locations` são as cidades de Comprar em (task 24).
  const media = () => agregado(prices, item, locations, enchantmentLevel, cacheDaMedia)
  const menor = () =>
    agregado(prices, item, locations, enchantmentLevel, cacheDaMedia, { modo: 'menor' })

  // A escolha do item vence qualquer base — inclusive a de um link antigo com `ing_price=<cidade>`.
  const escolha = escolhaDoItem(policy, 'compra', item)
  if (escolha === ORIGEM_MEDIA) return media()
  if (escolha === ORIGEM_MENOR) return menor()
  if (escolha) return deCidade(prices, item, escolha, enchantmentLevel)

  switch (policy.base.kind) {
    case 'city':
      return deCidade(prices, item, policy.base.locationId, enchantmentLevel)
    case 'sale_city':
      return deCidade(prices, item, saleLocationId, enchantmentLevel)
    case 'average':
      return media()
    case 'cheapest':
      return menor()
    default:
      return VAZIO
  }
}
