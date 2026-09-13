import { describe, expect, test } from 'vitest'

import { priceKey, type PriceIndex } from './prices'
import {
  DEFAULT_PRICING,
  itensComEscolhaPropria,
  ORIGEM_MEDIA,
  ORIGEM_MELHOR,
  ORIGEM_MENOR,
  origemDoItem,
  origemPadrao,
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

describe('origem escolhida por item (task 24)', () => {
  test('ingrediente com média usa as cidades de compra, mesmo com outra base', () => {
    // A média escolhida no item vence a base — até a de um link antigo com `ing_price=4002`.
    const index = indice([
      { item: 'T4_FIBER', local: '1002', sell: '100' },
      { item: 'T4_FIBER', local: '3005', sell: '300' },
      { item: 'T4_FIBER', local: '4002', sell: '900' },
    ])
    const policy: PricingPolicy = {
      ...DEFAULT_PRICING,
      base: { kind: 'city', locationId: '4002' },
      byItemCity: new Map([['T4_FIBER', ORIGEM_MEDIA]]),
    }

    // Comprar em = 1002 e 3005: Fort Sterling (900) não entra.
    expect(
      resolveIngredientPrice(index, policy, ['1002', '3005'], {
        item: 'T4_FIBER',
        enchantmentLevel: 0,
        saleLocationId: '1002',
      }).sell?.price,
    ).toBe('200')
  })

  test('venda com cidade escolhida cota nela, não na cidade da linha', () => {
    const index = indice([
      { item: 'T4_CLOTH', local: '1002', sell: '1100', buy: '1000' },
      { item: 'T4_CLOTH', local: '3005', sell: '1900', buy: '1800' },
    ])
    const preco = resolveOutputPrice(
      index,
      { ...DEFAULT_PRICING, saleByItem: new Map([['T4_CLOTH', '3005']]) },
      { item: 'T4_CLOTH', quality: 1, enchantmentLevel: 0, locationId: '1002' },
      ['1002', '3005'],
    )

    expect(preco.sell?.price).toBe('1900')
  })

  test('venda pela média usa as cidades de venda NA QUALIDADE DA SAÍDA', () => {
    // A média de ingrediente fixa qualidade 1, e está certo para ingrediente. Na venda o
    // jogador vende a qualidade que pediu: a armadilha abaixo é a qualidade 1 custando 50.
    const index: PriceIndex = new Map()
    const lado = (price: string) => ({ price, observedAt: T, source: 'client' })
    index.set(priceKey('T4_CLOTH', '1002', 1, 0), { sell: lado('50'), buy: null })
    index.set(priceKey('T4_CLOTH', '3005', 1, 0), { sell: lado('50'), buy: null })
    index.set(priceKey('T4_CLOTH', '1002', 2, 0), { sell: lado('1000'), buy: null })
    index.set(priceKey('T4_CLOTH', '3005', 2, 0), { sell: lado('2000'), buy: null })

    const preco = resolveOutputPrice(
      index,
      { ...DEFAULT_PRICING, saleByItem: new Map([['T4_CLOTH', ORIGEM_MEDIA]]) },
      { item: 'T4_CLOTH', quality: 2, enchantmentLevel: 0, locationId: '1002' },
      ['1002', '3005'],
    )

    expect(preco.sell?.price).toBe('1500')
    expect(preco.sell?.source).toContain('média')
  })

  test('preço fixo vence a cidade escolhida', () => {
    const index = indice([{ item: 'T4_CLOTH', local: '3005', sell: '1900' }])
    const preco = resolveOutputPrice(
      index,
      {
        ...DEFAULT_PRICING,
        manualSale: new Map([['T4_CLOTH', '1200']]),
        saleByItem: new Map([['T4_CLOTH', '3005']]),
      },
      { item: 'T4_CLOTH', quality: 1, enchantmentLevel: 0, locationId: '1002' },
      ['1002', '3005'],
    )

    expect(preco.sell?.price).toBe('1200')
  })

  test('origemDoItem lê a escolha de cada lado, na mesma precedência do engine', () => {
    const policy: PricingPolicy = {
      ...DEFAULT_PRICING,
      manual: new Map([['T4_FIBER', '250']]),
      byItemCity: new Map([
        ['T4_FIBER', '4002'],
        ['T3_CLOTH', ORIGEM_MEDIA],
      ]),
      saleByItem: new Map([['T4_CLOTH', '3005']]),
    }

    // Fixo vence a cidade do mesmo item.
    expect(origemDoItem(policy, 'compra', 'T4_FIBER')).toEqual({ tipo: 'fixo', valor: '250' })
    expect(origemDoItem(policy, 'compra', 'T3_CLOTH')).toEqual({ tipo: 'media' })
    expect(origemDoItem(policy, 'venda', 'T4_CLOTH')).toEqual({
      tipo: 'cidade',
      locationId: '3005',
    })
    expect(origemDoItem(policy, 'venda', 'T5_CLOTH')).toEqual({ tipo: 'padrao' })
  })
})

describe('padrão da barra (task 25)', () => {
  const FIBRA = { item: 'T4_FIBER', enchantmentLevel: 0, saleLocationId: '1002' }

  test('menor preço cota cada lado na cidade mais barata de Comprar em, e diz a cidade', () => {
    const index = indice([
      { item: 'T4_FIBER', local: '1002', sell: '300', buy: '120' },
      { item: 'T4_FIBER', local: '3005', sell: '100', buy: '200' },
      { item: 'T4_FIBER', local: '4002', sell: '50', buy: '10' },
    ])

    // Comprar em = 1002 e 3005: Fort Sterling, a mais barata de todas, fica fora.
    const preco = resolveIngredientPrice(
      index,
      { ...DEFAULT_PRICING, base: { kind: 'cheapest' } },
      ['1002', '3005'],
      FIBRA,
    )

    expect(preco.sell?.price).toBe('100')
    expect(preco.sell?.locationId).toBe('3005')
    // Oferta imediata e ordem de compra são compras diferentes: cada lado acha a sua cidade.
    expect(preco.buy?.price).toBe('120')
    expect(preco.buy?.locationId).toBe('1002')
  })

  test('menor preço ignora cidade sem cotação, em vez de tratar ausência como zero', () => {
    const index = indice([{ item: 'T4_FIBER', local: '3005', sell: '100' }])
    const preco = resolveIngredientPrice(
      index,
      { ...DEFAULT_PRICING, base: { kind: 'cheapest' } },
      CIDADES,
      FIBRA,
    )

    expect(preco.sell?.price).toBe('100')
    expect(preco.buy).toBeNull()
  })

  test('a média escolhida no item vence o menor preço da barra', () => {
    const index = indice([
      { item: 'T4_FIBER', local: '1002', sell: '100' },
      { item: 'T4_FIBER', local: '3005', sell: '300' },
    ])
    const barra: PricingPolicy = { ...DEFAULT_PRICING, base: { kind: 'cheapest' } }
    const preco = resolveIngredientPrice(
      index,
      { ...barra, byItemCity: new Map([['T4_FIBER', ORIGEM_MEDIA]]) },
      ['1002', '3005'],
      FIBRA,
    )

    // Contraste: sem a escolha do item, a barra dá o menor. Sem ele o teste passaria contra um
    // código que nem conhece o menor preço — a média escolhida já vencia qualquer base.
    expect(
      resolveIngredientPrice(index, barra, ['1002', '3005'], FIBRA).sell?.price,
    ).toBe('100')
    expect(preco.sell?.price).toBe('200')
  })

  test('o menor preço escolhido no item vence a média da barra', () => {
    const index = indice([
      { item: 'T4_FIBER', local: '1002', sell: '100' },
      { item: 'T4_FIBER', local: '3005', sell: '300' },
    ])
    const preco = resolveIngredientPrice(
      index,
      { ...DEFAULT_PRICING, byItemCity: new Map([['T4_FIBER', ORIGEM_MENOR]]) },
      ['1002', '3005'],
      FIBRA,
    )

    expect(preco.sell?.price).toBe('100')
  })

  test('venda pela média da barra vale para o item sem escolha', () => {
    const index = indice([
      { item: 'T4_CLOTH', local: '1002', sell: '1100' },
      { item: 'T4_CLOTH', local: '3005', sell: '1900' },
    ])
    const preco = resolveOutputPrice(
      index,
      { ...DEFAULT_PRICING, saleBase: 'average' },
      { item: 'T4_CLOTH', quality: 1, enchantmentLevel: 0, locationId: '1002' },
      ['1002', '3005'],
    )

    expect(preco.sell?.price).toBe('1500')
    expect(preco.sell?.source).toContain('média')
  })

  test('"melhor cidade" escolhida no item vence a média da barra', () => {
    const index = indice([
      { item: 'T4_CLOTH', local: '1002', sell: '1100' },
      { item: 'T4_CLOTH', local: '3005', sell: '1900' },
    ])
    const barra: PricingPolicy = { ...DEFAULT_PRICING, saleBase: 'average' }
    const saida = { item: 'T4_CLOTH', quality: 1, enchantmentLevel: 0, locationId: '1002' }
    const preco = resolveOutputPrice(
      index,
      { ...barra, saleByItem: new Map([['T4_CLOTH', ORIGEM_MELHOR]]) },
      saida,
      ['1002', '3005'],
    )

    // Contraste: sem a escolha do item, a barra dá a média. Sem ele, um código que ignora a
    // barra devolveria a cidade da linha e o teste passaria por acaso.
    expect(resolveOutputPrice(index, barra, saida, ['1002', '3005']).sell?.price).toBe('1500')
    // A cidade da linha — quem escolhe a melhor entre elas é `bestPerRecipe`.
    expect(preco.sell?.price).toBe('1100')
  })

  test('origemDoItem lê menor e melhor', () => {
    const policy: PricingPolicy = {
      ...DEFAULT_PRICING,
      byItemCity: new Map([['T4_FIBER', ORIGEM_MENOR]]),
      saleByItem: new Map([['T4_CLOTH', ORIGEM_MELHOR]]),
    }

    expect(origemDoItem(policy, 'compra', 'T4_FIBER')).toEqual({ tipo: 'menor' })
    expect(origemDoItem(policy, 'venda', 'T4_CLOTH')).toEqual({ tipo: 'melhor' })
  })

  test('origemPadrao traduz a barra na língua do seletor do item', () => {
    expect(origemPadrao(DEFAULT_PRICING, 'compra')).toEqual({ tipo: 'media' })
    expect(
      origemPadrao({ ...DEFAULT_PRICING, base: { kind: 'cheapest' } }, 'compra'),
    ).toEqual({ tipo: 'menor' })
    expect(origemPadrao(DEFAULT_PRICING, 'venda')).toEqual({ tipo: 'melhor' })
    expect(origemPadrao({ ...DEFAULT_PRICING, saleBase: 'average' }, 'venda')).toEqual({
      tipo: 'media',
    })
  })

  test('itens com preço próprio contam fixo e origem, uma vez por item, por lado', () => {
    const policy: PricingPolicy = {
      ...DEFAULT_PRICING,
      // T4_FIBER tem as duas coisas: conta uma vez.
      manual: new Map([['T4_FIBER', '250']]),
      byItemCity: new Map([
        ['T4_FIBER', '4002'],
        ['T3_CLOTH', ORIGEM_MEDIA],
      ]),
      saleByItem: new Map([['T4_CLOTH', '3005']]),
    }

    expect(itensComEscolhaPropria(policy, 'compra')).toBe(2)
    expect(itensComEscolhaPropria(policy, 'venda')).toBe(1)
  })
})
