import { describe, expect, test } from 'vitest'

import { priceKey, type PriceIndex } from './prices'
import {
  DEFAULT_PRICING,
  resolveIngredientPrice,
  resolveOutputPrice,
  type PricingPolicy,
} from './pricing'

/**
 * Task 4/11.3. A pergunta que este módulo responde é "por quanto EU compro esse ingrediente",
 * e ela deixou de ter uma única resposta ditada pela cidade da linha.
 */

const T = 1_757_000_000

function indice(
  linhas: Array<{ item: string; local: string; sell?: string; buy?: string; at?: number }>,
): PriceIndex {
  const index: PriceIndex = new Map()
  for (const l of linhas) {
    index.set(priceKey(l.item, l.local, 1, 0), {
      sell: l.sell ? { price: l.sell, observedAt: l.at ?? T, source: 'client' } : null,
      buy: l.buy ? { price: l.buy, observedAt: l.at ?? T, source: 'client' } : null,
    })
  }
  return index
}

const CIDADES = ['1002', '3005', '4002']

function resolver(index: PriceIndex, policy: PricingPolicy, saleLocation = '1002') {
  return resolveIngredientPrice(index, policy, CIDADES, {
    item: 'T4_FIBER',
    enchantmentLevel: 0,
    saleLocationId: saleLocation,
  })
}

describe('média das cidades', () => {
  test('é a média só das cidades que TÊM preço', () => {
    // 100 e 200 em duas cidades; a terceira não tem cotação. Média = 150, não 100 —
    // tratar ausência como zero seria inventar uma cidade que vende de graça.
    const preco = resolver(
      indice([
        { item: 'T4_FIBER', local: '1002', sell: '100' },
        { item: 'T4_FIBER', local: '3005', sell: '200' },
      ]),
      DEFAULT_PRICING,
    )

    expect(preco.sell?.price).toBe('150')
    expect(preco.sell?.source).toContain('média')
  })

  test('sem preço em cidade nenhuma, continua sem preço', () => {
    expect(resolver(indice([]), DEFAULT_PRICING).sell).toBeNull()
  })

  test('a idade herdada é a do dado mais VELHO da média', () => {
    // A média é tão confiável quanto a pior das observações que entraram nela.
    const preco = resolver(
      indice([
        { item: 'T4_FIBER', local: '1002', sell: '100', at: T },
        { item: 'T4_FIBER', local: '3005', sell: '200', at: T - 7200 },
      ]),
      DEFAULT_PRICING,
    )

    expect(preco.sell?.observedAt).toBe(T - 7200)
  })
})

describe('base fixa', () => {
  test('cidade fixa ignora a cidade da venda', () => {
    const index = indice([
      { item: 'T4_FIBER', local: '1002', sell: '100' },
      { item: 'T4_FIBER', local: '4002', sell: '900' },
    ])

    const preco = resolveIngredientPrice(
      index,
      { ...DEFAULT_PRICING, base: { kind: 'city', locationId: '4002' } },
      CIDADES,
      { item: 'T4_FIBER', enchantmentLevel: 0, saleLocationId: '1002' },
    )

    expect(preco.sell?.price).toBe('900')
  })

  test('"cidade da venda" reproduz o comportamento antigo', () => {
    const index = indice([
      { item: 'T4_FIBER', local: '1002', sell: '100' },
      { item: 'T4_FIBER', local: '4002', sell: '900' },
    ])
    const policy: PricingPolicy = { ...DEFAULT_PRICING, base: { kind: 'sale_city' } }

    expect(resolveIngredientPrice(index, policy, CIDADES, {
      item: 'T4_FIBER', enchantmentLevel: 0, saleLocationId: '4002',
    }).sell?.price).toBe('900')
  })
})

describe('exceção por item', () => {
  test('preço na mão vence tudo, nos dois lados, e não tem idade', () => {
    // Número digitado não é observação: entrar na conta de frescor faria a linha parecer
    // fresca porque alguém digitou, não porque o mercado foi visto.
    const preco = resolver(
      indice([{ item: 'T4_FIBER', local: '1002', sell: '100', buy: '90' }]),
      { ...DEFAULT_PRICING, manual: new Map([['T4_FIBER', '250']]) },
    )

    expect(preco.sell?.price).toBe('250')
    expect(preco.buy?.price).toBe('250')
    expect(preco.sell?.observedAt).toBeNull()
    expect(preco.sell?.source).toBe('manual')
  })

  test('cidade por item vence a base global', () => {
    const preco = resolver(
      indice([
        { item: 'T4_FIBER', local: '1002', sell: '100' },
        { item: 'T4_FIBER', local: '4002', sell: '900' },
      ]),
      { ...DEFAULT_PRICING, byItemCity: new Map([['T4_FIBER', '4002']]) },
    )

    expect(preco.sell?.price).toBe('900')
  })

  test('a exceção é por item, não por receita — vale onde aquele item aparecer', () => {
    const index = indice([
      { item: 'T4_FIBER', local: '1002', sell: '100' },
      { item: 'T3_CLOTH', local: '1002', sell: '300' },
    ])
    const policy = { ...DEFAULT_PRICING, manual: new Map([['T4_FIBER', '250']]) }

    expect(
      resolveIngredientPrice(index, policy, CIDADES, {
        item: 'T3_CLOTH', enchantmentLevel: 0, saleLocationId: '1002',
      }).sell?.price,
    ).toBe('300')
    expect(resolver(index, policy).sell?.price).toBe('250')
  })
})

describe('preço de venda na mão (task 11.4)', () => {
  test('substitui os dois lados da saída e não tem idade', () => {
    // "Eu vendo esse tecido por 1.200" vale nos dois modos: é o preço que a pessoa pratica,
    // não um livro com spread. Sem isso, conferir a linha contra o mercado exigia sair da tela.
    const index = indice([{ item: 'T4_CLOTH', local: '1002', sell: '1100', buy: '1000' }])

    const preco = resolveOutputPrice(
      index,
      { ...DEFAULT_PRICING, manualSale: new Map([['T4_CLOTH', '1200']]) },
      { item: 'T4_CLOTH', quality: 1, enchantmentLevel: 0, locationId: '1002' },
    )

    expect(preco.sell?.price).toBe('1200')
    expect(preco.buy?.price).toBe('1200')
    expect(preco.sell?.observedAt).toBeNull()
  })

  test('sem exceção, a saída continua vindo da cidade da linha', () => {
    const index = indice([{ item: 'T4_CLOTH', local: '1002', sell: '1100', buy: '1000' }])

    const preco = resolveOutputPrice(index, DEFAULT_PRICING, {
      item: 'T4_CLOTH',
      quality: 1,
      enchantmentLevel: 0,
      locationId: '1002',
    })

    expect(preco.sell?.price).toBe('1100')
    expect(preco.buy?.price).toBe('1000')
  })
})
