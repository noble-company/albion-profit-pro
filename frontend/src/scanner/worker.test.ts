import { describe, expect, test } from 'vitest'

import { computeScanner, type ScannerCatalog, type ScannerParams } from './engine'
import { buildPriceIndex, type PriceSnapshotOut } from './prices'
import { reviveRow, runScanner, serializeRow } from './worker'

/**
 * Task 4/12. `Money` é `Decimal` e **não atravessa `postMessage`** — a fronteira serializa para
 * string decimal, a mesma representação que o dinheiro já tem no fio (`F09`).
 *
 * O defeito que estes testes existem para pegar não é de conta: é de **campo que some**. A
 * primeira versão do worker listava os campos à mão e ficou desatualizada sem ninguém notar —
 * `averageUnitCost` e `ingredients` entraram depois e não estavam lá. Uma linha chegaria à tela
 * com a lista de compras vazia e o custo por item nulo, sem erro em lugar nenhum.
 */

const T = 1_757_000_000

const SNAPSHOT = {
  server: 'west',
  generated_at: new Date(T * 1000).toISOString(),
  row_count: 3,
  items: ['T4_FIBER', 'T3_CLOTH', 'T4_CLOTH'],
  locations: ['1002'],
  sources: ['client'],
  columns: {
    item: [0, 1, 2],
    location: [0, 0, 0],
    quality: [1, 1, 1],
    enchantment: [0, 0, 0],
    sell_min: ['100', '200', '1100'],
    sell_observed_at: [T, T, T],
    sell_source: [0, 0, 0],
    buy_max: ['90', '180', '1000'],
    buy_observed_at: [T, T, T],
    buy_source: [0, 0, 0],
  },
} as unknown as PriceSnapshotOut

const CATALOGO: ScannerCatalog = {
  items: [
    { unique_name: 'T4_CLOTH', weight: '0.51', enchantment_level: 0, tier: 4 },
    { unique_name: 'T4_FIBER', weight: '0.51', enchantment_level: 0 },
    { unique_name: 'T3_CLOTH', weight: '0.38', enchantment_level: 0 },
  ] as ScannerCatalog['items'],
  recipes: [
    {
      output_item: 'T4_CLOTH',
      production_kind: 'crafting',
      enchantment_level: 0,
      silver_cost: '0',
      crafting_focus: 100,
      amount_crafted: 1,
      ingredients: [
        { item: 'T4_FIBER', count: 2, enchantment_level: 0 },
        { item: 'T3_CLOTH', count: 1, enchantment_level: 0 },
      ],
      upgrade_resource: null,
    },
  ] as ScannerCatalog['recipes'],
}

const PARAMS: ScannerParams = {
  locations: ['1002'],
  priceLocations: ['1002'],
  pricing: {
    base: { kind: 'sale_city' },
    manual: new Map(),
    byItemCity: new Map(),
    manualSale: new Map(),
    saleByItem: new Map(),
  },
  strategy: { acquisition: 'best', sale: 'best' },
  quantityMeans: 'initial_recipes',
  destinyBoard: new Map(),
  premium: true,
  returnRate: '0',
  stationFeePer100Nutrition: '0',
  useFocus: true,
  outputQuality: 1,
  quantity: 100,
}

const original = () => computeScanner(CATALOGO, buildPriceIndex(SNAPSHOT), PARAMS)[0]!

describe('a fronteira do Worker', () => {
  test('ida e volta devolve a linha idêntica, string a string', () => {
    const antes = original()
    const depois = reviveRow(serializeRow(antes))

    expect(depois.totalCost?.toString()).toBe(antes.totalCost?.toString())
    expect(depois.profit?.toString()).toBe(antes.profit?.toString())
    expect(depois.roi?.toString()).toBe(antes.roi?.toString())
    expect(depois.averageUnitCost?.toString()).toBe(antes.averageUnitCost?.toString())
    expect(depois.profitPerWeight?.toString()).toBe(antes.profitPerWeight?.toString())
    expect(depois.profitPerFocus?.toString()).toBe(antes.profitPerFocus?.toString())
  })

  test('a lista de compras atravessa inteira — foi ela que sumiu antes', () => {
    const antes = original()
    const depois = reviveRow(serializeRow(antes))

    expect(depois.ingredients).toHaveLength(antes.ingredients.length)
    expect(depois.ingredients[0]?.item).toBe(antes.ingredients[0]?.item)
    expect(depois.ingredients[0]?.purchaseQuantity).toBe(
      antes.ingredients[0]?.purchaseQuantity,
    )
    expect(depois.ingredients[0]?.unitPrice?.toString()).toBe(
      antes.ingredients[0]?.unitPrice?.toString(),
    )
    expect(depois.ingredients[0]?.subtotal?.toString()).toBe(
      antes.ingredients[0]?.subtotal?.toString(),
    )
  })

  test('nenhum campo fica de fora — a linha revivida tem as mesmas chaves', () => {
    // A garantia estrutural, não por amostragem: se um campo novo entrar em `ScannerRow` e a
    // serialização esquecer dele, isto acusa. O tipo já obriga na compilação; este teste pega
    // o caso em que alguém contorna o tipo.
    const antes = original()
    const depois = reviveRow(serializeRow(antes))

    expect(Object.keys(depois).sort()).toEqual(Object.keys(antes).sort())
  })

  test('valor ausente continua ausente, não vira zero', () => {
    // `null` é "não sabemos" e sobreviveu a fase inteira sendo isso (`X02`). Virar `0` no
    // meio da serialização seria uma afirmação sobre o mercado que ninguém fez.
    const semPreco = computeScanner(
      CATALOGO,
      buildPriceIndex({ ...SNAPSHOT, row_count: 0 }),
      PARAMS,
    )[0]!

    const depois = reviveRow(serializeRow(semPreco))
    expect(depois.totalCost).toBeNull()
    expect(depois.profit).toBeNull()
    expect(depois.state).toBe('missing_output_price')
  })
})

describe('runScanner', () => {
  test('devolve as linhas serializadas e o tempo que levou', () => {
    const resposta = runScanner({
      id: 7,
      catalog: CATALOGO,
      snapshot: SNAPSHOT,
      params: PARAMS,
    })

    expect(resposta.id).toBe(7)
    expect(resposta.rows).toHaveLength(1)
    expect(resposta.rows[0]?.totalCost).toBe(original().totalCost?.toString())
    expect(resposta.durationMs).toBeGreaterThanOrEqual(0)
  })
})

describe('a taxa da estação atravessa o Worker (task 4/18)', () => {
  test('o craft cobra estação igual ao refino — o valor do item viaja no catálogo', () => {
    // O refino calcula na thread principal e o craft no Worker. Se a mensagem `data` um dia
    // deixar de levar `item_value`, o refino continua certo e **só o craft** para de cobrar a
    // estação — o tipo mapeado de `ScannerRow` não cobre isso, porque o valor do item viaja no
    // catálogo, não na linha.
    const catalogoComValor: ScannerCatalog = {
      ...CATALOGO,
      items: CATALOGO.items.map((item) =>
        item.unique_name === 'T4_CLOTH' ? { ...item, item_value: '16' } : item,
      ),
    }
    const params: ScannerParams = { ...PARAMS, stationFeePer100Nutrition: '390', quantity: 1 }

    const pelaThreadPrincipal = computeScanner(
      catalogoComValor,
      buildPriceIndex(SNAPSHOT),
      params,
    )[0]!
    const peloWorker = runScanner({
      id: 1,
      catalog: catalogoComValor,
      snapshot: SNAPSHOT,
      params,
    }).rows[0]!

    // 16 × 0,1125 = 1,8 de nutrição; 1,8 × 390/100 = 7,02.
    expect(pelaThreadPrincipal.totalCost).not.toBeNull()
    expect(peloWorker.totalCost).toBe(pelaThreadPrincipal.totalCost?.toString())

    const semEstacao = computeScanner(catalogoComValor, buildPriceIndex(SNAPSHOT), {
      ...params,
      stationFeePer100Nutrition: '0',
    })[0]!
    expect(
      pelaThreadPrincipal.totalCost!.minus(semEstacao.totalCost!).toString(),
    ).toBe('7.02')
  })
})

describe('o preço unitário de venda atravessa o Worker (task 4/20)', () => {
  test('vai como string decimal e volta como Decimal, sem perder o valor', () => {
    // O spread de `serializeRow` levaria o `Decimal` como objeto, e o `structuredClone` do
    // `postMessage` perderia o protótipo: do outro lado chegaria algo sem `.plus()`.
    const antes = original()
    const serializada = serializeRow(antes)

    expect(typeof serializada.saleUnitPrice).toBe('string')
    const depois = reviveRow(serializada)
    expect(depois.saleUnitPrice?.toString()).toBe(antes.saleUnitPrice?.toString())
    expect(typeof depois.saleUnitPrice?.plus).toBe('function')
  })
})
