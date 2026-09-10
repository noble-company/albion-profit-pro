import { describe, expect, test } from 'vitest'


import { money, percentageToRate } from '@/lib/money'

import {
  bestPerRecipe,
  computeScanner,
  explainRow,
  type ScannerCatalog,
  type ScannerParams,
} from './engine'
import { buildPriceIndex, type PriceSnapshotOut } from './prices'
import { ORIGEM_MEDIA } from './pricing'

/**
 * Task 4/05. Os valores esperados são **conferidos à mão** nos comentários, não extraídos da
 * própria implementação — senão o teste só provaria que o código concorda consigo mesmo.
 */

const OBSERVADO = 1_757_000_000

function snapshot(
  rows: Array<{
    item: string
    location: string
    quality?: number
    ench?: number
    sell?: string
    buy?: string
    sellAt?: number
    buyAt?: number
  }>,
): PriceSnapshotOut {
  const items: string[] = []
  const locations: string[] = []
  const sources = ['client']
  const idx = (registry: string[], value: string) => {
    const found = registry.indexOf(value)
    if (found !== -1) return found
    registry.push(value)
    return registry.length - 1
  }

  const columns = {
    item: [] as number[],
    location: [] as number[],
    quality: [] as number[],
    enchantment: [] as number[],
    sell_min: [] as (string | null)[],
    sell_observed_at: [] as (number | null)[],
    sell_source: [] as (number | null)[],
    buy_max: [] as (string | null)[],
    buy_observed_at: [] as (number | null)[],
    buy_source: [] as (number | null)[],
  }

  for (const row of rows) {
    columns.item.push(idx(items, row.item))
    columns.location.push(idx(locations, row.location))
    columns.quality.push(row.quality ?? 1)
    columns.enchantment.push(row.ench ?? 0)
    columns.sell_min.push(row.sell ?? null)
    columns.sell_observed_at.push(row.sell ? (row.sellAt ?? OBSERVADO) : null)
    columns.sell_source.push(row.sell ? 0 : null)
    columns.buy_max.push(row.buy ?? null)
    columns.buy_observed_at.push(row.buy ? (row.buyAt ?? OBSERVADO) : null)
    columns.buy_source.push(row.buy ? 0 : null)
  }

  return {
    server: 'west',
    generated_at: new Date(OBSERVADO * 1000).toISOString(),
    row_count: rows.length,
    items,
    locations,
    sources,
    columns,
  }
}

/** Refino de T4_CLOTH: 2×T4_FIBER + 1×T3_CLOTH, 1 produzido, sem custo de prata. */
const CATALOGO: ScannerCatalog = {
  items: [
    // `item_value` é o `@itemvalue` real do T4_CLOTH — a base da taxa da estação (task 4/18).
    { unique_name: 'T4_CLOTH', weight: '0.51', enchantment_level: 0, tier: 4, crafting_category: 'fiber', item_value: '16' },
    { unique_name: 'T4_FIBER', weight: '0.51', enchantment_level: 0 },
    { unique_name: 'T3_CLOTH', weight: '0.38', enchantment_level: 0 },
  ] as ScannerCatalog['items'],
  recipes: [
    {
      output_item: 'T4_CLOTH',
      production_kind: 'refining',
      enchantment_level: 0,
      silver_cost: 0,
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

const PADRAO: ScannerParams = {
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
  useFocus: false,
  outputQuality: 1,
  quantity: 1,
}

function rodar(snap: PriceSnapshotOut, params: Partial<ScannerParams> = {}) {
  return computeScanner(CATALOGO, buildPriceIndex(snap), { ...PADRAO, ...params })
}

describe('computeScanner — o cálculo que saiu do servidor', () => {
  test('lucro e ROI conferidos à mão, cenário imediato/imediato', () => {
    // Sem preço de `buy` nos ingredientes e sem `sell` na saída, sobra um cenário só.
    // Comprar imediato: 2×100 (fibra) + 1×200 (tecido T3) = 400, sem setup fee.
    // Vender imediato: recebe do maior request = 1000 bruto.
    //   imposto premium 4% -> ceil(1000×0.04) = 40, sem setup fee.
    //   líquido 960, custo 400 -> lucro 560, ROI 560/400 = 140%.
    const linha = rodar(
      snapshot([
        { item: 'T4_FIBER', location: '1002', sell: '100' },
        { item: 'T3_CLOTH', location: '1002', sell: '200' },
        { item: 'T4_CLOTH', location: '1002', buy: '1000' },
      ]),
    )[0]!

    expect(linha.state).toBe('priced')
    expect(linha.acquisitionMode).toBe('immediate')
    expect(linha.saleMode).toBe('immediate')
    expect(linha.totalCost?.toString()).toBe('400')
    expect(linha.salesTax?.toString()).toBe('40')
    expect(linha.netRevenue?.toString()).toBe('960')
    expect(linha.profit?.toString()).toBe('560')
    expect(linha.roi?.toString()).toBe('140')
  })

  test('com os quatro cenários disponíveis, vence o mais lucrativo', () => {
    // Aquisição imediata: 2×100 + 1×200 = 400, sem taxa.
    // Ordem de compra: fibra 2×90=180, tecido 1×180=180.
    //   A taxa é POR INGREDIENTE: ceil(180×0,025)=ceil(4,5)=5, duas vezes = 10.
    //   custo = 360 + 10 = 370. Ordem ganha.
    // Venda imediata: bruto 1000, imposto ceil(40)=40 -> líquido 960.
    // Ordem de venda:  bruto 1100, imposto ceil(44)=44, setup ceil(27,5)=28 -> líquido 1028. Ganha.
    // lucro = 1028 − 370 = 658. ROI = 658/370 = 177,8378%.
    const linha = rodar(
      snapshot([
        { item: 'T4_FIBER', location: '1002', sell: '100', buy: '90' },
        { item: 'T3_CLOTH', location: '1002', sell: '200', buy: '180' },
        { item: 'T4_CLOTH', location: '1002', sell: '1100', buy: '1000' },
      ]),
    )[0]!

    expect(linha.acquisitionMode).toBe('buy_order')
    expect(linha.saleMode).toBe('sell_order')
    expect(linha.totalCost?.toString()).toBe('370')
    expect(linha.netRevenue?.toString()).toBe('1028')
    expect(linha.profit?.toString()).toBe('658')
    expect(linha.roi?.toString()).toBe('177.8378')
  })

  test('a taxa de montagem é cobrada por ingrediente, não sobre o total somado', () => {
    // Divergência real encontrada na task 4/06 contra `craft/service.py::_build_scenario`,
    // que faz `sum(part.setup_fee for part in acquisition_parts)`.
    // Ordem de compra: fibra 2×10 = 20, tecido 1×20 = 20.
    //   Por ingrediente: ceil(20×0,025) = ceil(0,5) = 1, duas vezes = 2 -> custo 42.
    //   Sobre o total somado daria ceil(40×0,025) = ceil(1) = 1 -> custo 41. **Errado.**
    const linha = rodar(
      snapshot([
        { item: 'T4_FIBER', location: '1002', sell: '100', buy: '10' },
        { item: 'T3_CLOTH', location: '1002', sell: '200', buy: '20' },
        { item: 'T4_CLOTH', location: '1002', sell: '1100', buy: '1000' },
      ]),
    )[0]!

    expect(linha.acquisitionMode).toBe('buy_order')
    expect(linha.totalCost?.toString()).toBe('42')
  })

  test('premium muda só o imposto', () => {
    const snap = snapshot([
      { item: 'T4_FIBER', location: '1002', sell: '100' },
      { item: 'T3_CLOTH', location: '1002', sell: '200' },
      { item: 'T4_CLOTH', location: '1002', buy: '1000' },
    ])

    const comPremium = rodar(snap, { premium: true })[0]!
    const semPremium = rodar(snap, { premium: false })[0]!

    expect(comPremium.salesTax?.toString()).toBe('40') // 4%
    expect(semPremium.salesTax?.toString()).toBe('80') // 8%
    expect(comPremium.totalCost?.toString()).toBe(semPremium.totalCost?.toString())
    expect(comPremium.profit?.minus(semPremium.profit!).toString()).toBe('40')
  })

  test('o retorno não muda a compra — muda quantas vezes você refina', () => {
    const snap = snapshot([
      { item: 'T4_FIBER', location: '1002', sell: '100' },
      { item: 'T3_CLOTH', location: '1002', sell: '200' },
      { item: 'T4_CLOTH', location: '1002', buy: '1000' },
    ])

    // 50% de retorno, 1 receita inicial: compra os mesmos 2 fibras + 1 tecido, e o que volta
    // dá para refinar de novo — floor(1 / 0,5) = 2 execuções, 2 tecidos no fim.
    const comRetorno = rodar(snap, { returnRate: '0.5' })[0]!
    const semRetorno = rodar(snap)[0]!

    expect(comRetorno.ingredients.map((i) => i.purchaseQuantity)).toEqual(
      semRetorno.ingredients.map((i) => i.purchaseQuantity),
    )
    expect(comRetorno.totalCost?.toString()).toBe('400')
    expect(comRetorno.producedQuantity).toBe(2)
    expect(semRetorno.producedQuantity).toBe(1)
  })

  test('num LOTE, o retorno rende mais itens com a MESMA compra', () => {
    // O retorno do Albion é recursivo: o que volta é refinado de novo, e o que voltar disso
    // também. A soma da série é `1/(1−r)` — 1000 receitas com 15,2% viram 1179 execuções.
    const snap = snapshot([
      { item: 'T4_FIBER', location: '1002', sell: '100' },
      { item: 'T3_CLOTH', location: '1002', sell: '200' },
      { item: 'T4_CLOTH', location: '1002', buy: '1000' },
    ])

    // Compra para 1000 receitas: 2000 fibras + 1000 tecidos = 400.000, com ou sem retorno.
    // Com 15,2%: floor(1000 / 0,848) = 1179 execuções -> 1179 tecidos.
    //   venda 1179×1000 = 1.179.000, imposto 4% = 47.160 -> líquido 1.131.840.
    //   lucro = 1.131.840 − 400.000 = 731.840.
    // Sem retorno: 1000 tecidos -> líquido 960.000 -> lucro 560.000.
    const comRetorno = rodar(snap, { quantity: 1000, returnRate: '0.152' })[0]!
    const semRetorno = rodar(snap, { quantity: 1000, returnRate: '0' })[0]!

    expect(comRetorno.ingredients.map((i) => i.purchaseQuantity)).toEqual([2000, 1000])
    expect(comRetorno.totalCost?.toString()).toBe('400000')
    expect(comRetorno.producedQuantity).toBe(1179)
    expect(comRetorno.profit?.toString()).toBe('731840')
    expect(semRetorno.profit?.toString()).toBe('560000')
  })

  test('em UMA receita o retorno não muda nada — e isso é verdade, não bug', () => {
    // `floor(1 / 0,848) = 1`: uma receita só não devolve recurso suficiente para uma segunda.
    // O erro estava no padrão da tela ser 1, que escondia o efeito inteiro.
    const snap = snapshot([
      { item: 'T4_FIBER', location: '1002', sell: '100' },
      { item: 'T3_CLOTH', location: '1002', sell: '200' },
      { item: 'T4_CLOTH', location: '1002', buy: '1000' },
    ])

    expect(rodar(snap, { quantity: 1, returnRate: '0.152' })[0]!.profit?.toString()).toBe(
      rodar(snap, { quantity: 1, returnRate: '0' })[0]!.profit?.toString(),
    )
  })

  test('custo médio por item junta TODOS os custos, não só a compra', () => {
    // 100 refinos numa estação que cobra 390 por 100 de nutrição — a taxa do print do jogo.
    // Fibras 200×100 = 20.000, tecidos 100×200 = 20.000.
    // Estação: 16 (valor do item) × 0,1125 = 1,8 de nutrição por execução; 1,8 × 390/100 = 7,02
    // por execução; × 100 = 702. Custo 40.702, médio 407,02 por item.
    const linha = rodar(
      snapshot([
        { item: 'T4_FIBER', location: '1002', sell: '100' },
        { item: 'T3_CLOTH', location: '1002', sell: '200' },
        { item: 'T4_CLOTH', location: '1002', buy: '1000' },
      ]),
      { quantity: 100, stationFeePer100Nutrition: '390' },
    )[0]!

    expect(linha.totalCost?.toString()).toBe('40702')
    expect(linha.producedQuantity).toBe(100)
    expect(linha.averageUnitCost?.toString()).toBe('407.02')
  })

  test('o percentual digitado entra como decimal exato (regressão da task 3.6/01)', () => {
    // `36,7` tem que virar 0.367, não 0.36700000000000005.
    expect(percentageToRate('36,7')).toBe('0.367')
    const linha = rodar(
      snapshot([
        { item: 'T4_FIBER', location: '1002', sell: '100' },
        { item: 'T3_CLOTH', location: '1002', sell: '200' },
        { item: 'T4_CLOTH', location: '1002', buy: '1000' },
      ]),
      { returnRate: percentageToRate('36,7') },
    )[0]!
    // 2 fibras × (1−0.367) = 1.266 -> ceil = 2. 1 tecido × 0.633 = 0.633 -> ceil = 1.
    expect(linha.totalCost?.toString()).toBe('400')
  })
})

describe('painel do destino (task 17)', () => {
  const SNAP_FOCO = () =>
    snapshot([
      { item: 'T4_FIBER', location: '1002', sell: '100' },
      { item: 'T3_CLOTH', location: '1002', sell: '200' },
      { item: 'T4_CLOTH', location: '1002', buy: '1000' },
    ])

  test('a especialização reduz o foco consumido — e o lucro por foco sobe junto', () => {
    // `Tecelão de Fibras Adepto` em 100: 28.000 de eficiência ao refinar tecido T4 — 0,5^2,8 do
    // custo. O catálogo do teste cobra 100 por execução: 100 × 0,143587 = 14,3587.
    const comPainel = rodar(SNAP_FOCO(), {
      useFocus: true,
      destinyBoard: new Map([['refine:fiber:4', 100]]),
    })[0]!
    const semPainel = rodar(SNAP_FOCO(), { useFocus: true })[0]!

    expect(semPainel.focusConsumed).toBe(100)
    // 14,3587 vira 15: o jogo cobra ponto inteiro de foco por craft, e cobrar "14,36" seria
    // um número que o jogador não vê em lugar nenhum.
    expect(comPainel.focusConsumed).toBe(15)
    // Mesmo lucro, muito menos foco: a métrica que ranqueia o dia muda de patamar.
    expect(comPainel.profit?.toString()).toBe(semPainel.profit?.toString())
    expect(Number(comPainel.profitPerFocus)).toBeGreaterThan(
      Number(semPainel.profitPerFocus) * 6,
    )
  })

  test('painel vazio deixa o custo base — ninguém ganha desconto que não conquistou', () => {
    expect(rodar(SNAP_FOCO(), { useFocus: true })[0]!.focusConsumed).toBe(100)
  })

  test('o foco cobrado é inteiro, arredondado para CIMA, por execução', () => {
    // Por execução, e não no total: o jogo cobra cada craft separadamente, então 3 refinos de
    // 15 custam 45 — não `ceil(3 × 14,3587) = 44`.
    const uma = rodar(SNAP_FOCO(), {
      useFocus: true,
      quantity: 1,
      destinyBoard: new Map([['refine:fiber:4', 100]]),
    })[0]!
    const tres = rodar(SNAP_FOCO(), {
      useFocus: true,
      quantity: 3,
      destinyBoard: new Map([['refine:fiber:4', 100]]),
    })[0]!

    expect(uma.focusConsumed).toBe(15)
    expect(tres.focusConsumed).toBe(45)
  })

  test('nó de outra família não reduz nada', () => {
    const linha = rodar(SNAP_FOCO(), {
      useFocus: true,
      destinyBoard: new Map([['refine:ore:4', 100]]),
    })[0]!

    expect(linha.focusConsumed).toBe(100)
  })
})

describe('sessão de refino (task 11.6)', () => {
  const SNAP_SESSAO = () =>
    snapshot([
      { item: 'T4_FIBER', location: '1002', sell: '100' },
      { item: 'T3_CLOTH', location: '1002', sell: '200' },
      { item: 'T4_CLOTH', location: '1002', buy: '1000' },
    ])

  test('a compra é para as receitas INICIAIS; o retorno vira execução extra', () => {
    // O modelo antigo respondia "quero 1000 tecidos, quanto compro?" e descontava o retorno da
    // compra (1696 fibras). Este responde "comprei para 1000 refinos, quanto sai?": compra
    // cheia, e o que volta é refinado de novo.
    // 1000 receitas × 15,2%: total de execuções = floor(1000 / 0,848) = 1179.
    const linha = rodar(SNAP_SESSAO(), { quantity: 1000, returnRate: '0.152' })[0]!

    expect(linha.ingredients.map((i) => i.purchaseQuantity)).toEqual([2000, 1000])
    expect(linha.executions).toBe(1179)
    expect(linha.producedQuantity).toBe(1179)
  })

  test('o custo da estação acompanha as execuções TOTAIS, não as iniciais', () => {
    // O ponto que o usuário levantou: a barraca cobra por craft, e o jogador faz 1179 crafts,
    // não 1000. Cobrar pelas iniciais subestimaria o custo em 18%.
    const linha = rodar(SNAP_SESSAO(), {
      quantity: 1000,
      returnRate: '0.152',
      stationFeePer100Nutrition: '390',
    })[0]!

    // compra 2000×100 + 1000×200 = 400.000; estação 7,02 por execução × 1179 = 8.276,58.
    // Cobrar pelas 1000 iniciais daria 7.020 — 18% a menos.
    expect(linha.totalCost?.toString()).toBe('408276.58')
  })

  test('sem retorno, receitas iniciais e execuções são a mesma coisa', () => {
    const linha = rodar(SNAP_SESSAO(), { quantity: 500, returnRate: '0' })[0]!

    expect(linha.executions).toBe(500)
    expect(linha.producedQuantity).toBe(500)
    expect(linha.ingredients.map((i) => i.purchaseQuantity)).toEqual([1000, 500])
  })
})

describe('linha sem NADA observado (regressão da tela branca)', () => {
  test('com todo preço na mão, a idade é ausência — nunca Infinity', () => {
    // `Math.min()` sem argumentos devolve `Infinity`, e `new Date(Infinity).toISOString()`
    // estoura com `RangeError: Invalid time value`. Era a tela inteira caindo no boundary
    // quando o jogador fixava o preço de todos os ingredientes E o de venda: não sobrava
    // nenhuma observação de mercado para datar a linha.
    const linha = rodar(
      snapshot([
        { item: 'T4_FIBER', location: '1002', sell: '100' },
        { item: 'T3_CLOTH', location: '1002', sell: '200' },
        { item: 'T4_CLOTH', location: '1002', buy: '1000' },
      ]),
      {
        pricing: {
          base: { kind: 'sale_city' },
          manual: new Map([
            ['T4_FIBER', '250'],
            ['T3_CLOTH', '300'],
          ]),
          byItemCity: new Map(),
          manualSale: new Map([['T4_CLOTH', '2000']]),
          saleByItem: new Map(),
        },
      },
    )[0]!

    expect(linha.state).toBe('priced')
    expect(linha.oldestObservedAt).toBeNull()
    expect(Number.isFinite(linha.oldestObservedAt ?? 0)).toBe(true)
  })
})

describe('estratégia forçada (task 11.5)', () => {
  const SNAP = () =>
    snapshot([
      { item: 'T4_FIBER', location: '1002', sell: '100', buy: '90' },
      { item: 'T3_CLOTH', location: '1002', sell: '200', buy: '180' },
      { item: 'T4_CLOTH', location: '1002', sell: '1100', buy: '1000' },
    ])

  test('travar em imediato/imediato dá o número que NÃO depende de fila', () => {
    // O padrão escolhe o cenário mais lucrativo, que supõe as duas ordens sendo aceitas. Quem
    // compra e vende na hora vê outro número — e é esse que a tela precisa saber mostrar.
    const linha = rodar(SNAP(), {
      strategy: { acquisition: 'immediate', sale: 'immediate' },
    })[0]!

    expect(linha.acquisitionMode).toBe('immediate')
    expect(linha.saleMode).toBe('immediate')
    expect(linha.totalCost?.toString()).toBe('400')
    expect(linha.profit?.toString()).toBe('560') // contra 658 do melhor cenário
  })

  test('forçar um modo sem preço deixa a linha SEM número, com o motivo', () => {
    // Não existe "cair para o outro modo em silêncio": quem pediu ordem de compra precisa saber
    // que não há ordem de compra, e não receber o preço da compra imediata disfarçado.
    const linha = rodar(
      snapshot([
        { item: 'T4_FIBER', location: '1002', sell: '100' },
        { item: 'T3_CLOTH', location: '1002', sell: '200' },
        { item: 'T4_CLOTH', location: '1002', buy: '1000' },
      ]),
      { strategy: { acquisition: 'buy_order', sale: 'best' } },
    )[0]!

    expect(linha.state).toBe('missing_ingredient_price')
    expect(linha.profit).toBeNull()
  })

  test('sem estratégia declarada, continua vencendo o mais lucrativo', () => {
    const linha = rodar(SNAP())[0]!
    expect(linha.acquisitionMode).toBe('buy_order')
    expect(linha.saleMode).toBe('sell_order')
  })
})

describe('explicação da linha (task 11.4)', () => {
  const SNAP_COMPLETO = () =>
    snapshot([
      { item: 'T4_FIBER', location: '1002', sell: '100', buy: '90' },
      { item: 'T3_CLOTH', location: '1002', sell: '200', buy: '180' },
      { item: 'T4_CLOTH', location: '1002', sell: '1100', buy: '1000' },
    ])

  const explicar = (params: Partial<ScannerParams> = {}) =>
    explainRow(CATALOGO, buildPriceIndex(SNAP_COMPLETO()), { ...PADRAO, ...params }, {
      outputItem: 'T4_CLOTH',
      locationId: '1002',
    })

  test('os QUATRO cenários aparecem, não só o vencedor', () => {
    // O engine já calcula os quatro e joga três fora. "Ordem de compra rende mais, mas você
    // espera na fila" é decisão — e hoje a tela não deixa ver o trade-off.
    const detalhe = explicar()!

    expect(detalhe.scenarios).toHaveLength(4)
    expect(detalhe.scenarios.map((c) => `${c.acquisitionMode}/${c.saleMode}`)).toEqual([
      'immediate/immediate',
      'immediate/sell_order',
      'buy_order/immediate',
      'buy_order/sell_order',
    ])

    // Conferido à mão: imediato/imediato = custo 400, líquido 960 -> lucro 560.
    const imediato = detalhe.scenarios[0]!
    expect(imediato.totalCost.toString()).toBe('400')
    expect(imediato.profit.toString()).toBe('560')

    // O vencedor é o mesmo que a linha da tabela mostra.
    const vencedor = detalhe.scenarios.find((c) => c.best)!
    expect(vencedor.acquisitionMode).toBe('buy_order')
    expect(vencedor.saleMode).toBe('sell_order')
    expect(vencedor.profit.toString()).toBe('658')
  })

  test('o extrato SOMA exatamente o custo e a receita da linha', () => {
    // Um extrato que não fecha com o total é pior que extrato nenhum: convida a confiar no
    // detalhe e decidir pelo número errado.
    const { breakdown } = explicar()!

    expect(
      breakdown.ingredientCost
        .plus(breakdown.acquisitionSetupFee)
        .plus(breakdown.recipeSilver)
        .plus(breakdown.stationCost)
        .toString(),
    ).toBe(breakdown.totalCost.toString())

    expect(
      breakdown.grossRevenue
        .minus(breakdown.salesTax)
        .minus(breakdown.saleSetupFee)
        .toString(),
    ).toBe(breakdown.netRevenue.toString())
  })

  test('cada ingrediente carrega procedência e idade do preço usado', () => {
    // Sem isso, "bate com o mercado?" não tem resposta: o número aparece sem dizer de onde veio.
    const detalhe = explicar()!
    const fibra = detalhe.ingredients[0]!

    expect(fibra.item).toBe('T4_FIBER')
    expect(fibra.unitPrice?.toString()).toBe('90') // o cenário vencedor é ordem de compra
    expect(fibra.source).toBe('client')
    expect(fibra.observedAt).toBe(OBSERVADO)
  })

  test('o preço de equilíbrio cobre custo e taxas de venda', () => {
    // Vender pelo custo médio ainda perde imposto e setup. Equilíbrio = o mínimo que empata.
    // Cenário vencedor: custo 370, venda por ordem (imposto 4% + setup 2,5%).
    // 370 / (1 − 0,065) = 395,72 por unidade produzida (1).
    const detalhe = explicar()!
    expect(detalhe.breakEvenUnitPrice?.toDecimalPlaces(2).toString()).toBe('395.72')
  })
})

describe('melhor cidade (task 11.3)', () => {
  test('sobra uma linha por receita, e é a de maior lucro', () => {
    const linhas = rodar(
      snapshot([
        { item: 'T4_FIBER', location: '1002', sell: '100' },
        { item: 'T3_CLOTH', location: '1002', sell: '200' },
        { item: 'T4_CLOTH', location: '1002', buy: '1000' },
        { item: 'T4_FIBER', location: '3005', sell: '100' },
        { item: 'T3_CLOTH', location: '3005', sell: '200' },
        { item: 'T4_CLOTH', location: '3005', buy: '1500' },
      ]),
      { locations: ['1002', '3005'], priceLocations: ['1002', '3005'] },
    )
    expect(linhas).toHaveLength(2)

    const melhor = bestPerRecipe(linhas)
    expect(melhor).toHaveLength(1)
    expect(melhor[0]!.locationId).toBe('3005')
  })

  test('receita sem preço em cidade nenhuma continua aparecendo, uma vez só', () => {
    // O `X01` de novo: reduzir para uma linha por receita não pode virar um jeito novo de
    // sumir com a receita.
    const melhor = bestPerRecipe(
      rodar(snapshot([]), { locations: ['1002', '3005'], priceLocations: ['1002', '3005'] }),
    )

    expect(melhor).toHaveLength(1)
    expect(melhor[0]!.state).toBe('missing_output_price')
  })
})

describe('a linha nunca some — X01/X02 na camada de cálculo', () => {
  test('sem preço de ingrediente, a linha existe e diz o motivo', () => {
    const linhas = rodar(
      snapshot([
        { item: 'T4_FIBER', location: '1002', sell: '100' },
        // T3_CLOTH ausente de propósito
        { item: 'T4_CLOTH', location: '1002', buy: '1000' },
      ]),
    )

    expect(linhas).toHaveLength(1)
    expect(linhas[0]!.state).toBe('missing_ingredient_price')
    expect(linhas[0]!.profit).toBeNull()
    expect(linhas[0]!.outputItem).toBe('T4_CLOTH') // a receita continua visível
  })

  test('sem preço de saída, idem', () => {
    const linhas = rodar(
      snapshot([
        { item: 'T4_FIBER', location: '1002', sell: '100' },
        { item: 'T3_CLOTH', location: '1002', sell: '200' },
      ]),
    )

    expect(linhas[0]!.state).toBe('missing_output_price')
    expect(linhas[0]!.profit).toBeNull()
  })

  test('cidade sem nenhum preço ainda produz linha', () => {
    const linhas = rodar(snapshot([]), { locations: ['1002', '3005'] })
    expect(linhas).toHaveLength(2)
    expect(linhas.every((l) => l.state === 'missing_output_price')).toBe(true)
  })
})

describe('métricas da planilha', () => {
  const snap = snapshot([
    { item: 'T4_FIBER', location: '1002', sell: '100' },
    { item: 'T3_CLOTH', location: '1002', sell: '200' },
    { item: 'T4_CLOTH', location: '1002', buy: '1000' },
  ])

  test('lucro por peso', () => {
    // lucro 560 (imediato/imediato), peso 0.51 × 1 produzido = 0.51 -> 560/0.51.
    const linha = rodar(snap)[0]!
    expect(linha.profit?.toString()).toBe('560')
    expect(linha.profitPerWeight?.toDecimalPlaces(2).toString()).toBe('1098.04')
  })

  test('lucro por foco só existe com foco ligado', () => {
    expect(rodar(snap, { useFocus: false })[0]!.profitPerFocus).toBeNull()
    // foco 100 × 1 execução; lucro 560 -> 5.6 por ponto.
    expect(rodar(snap, { useFocus: true })[0]!.profitPerFocus?.toString()).toBe('5.6')
  })

  test('item sem peso não inventa lucro por peso', () => {
    const semPeso: ScannerCatalog = {
      ...CATALOGO,
      items: CATALOGO.items.map((i) =>
        i.unique_name === 'T4_CLOTH' ? { ...i, weight: null } : i,
      ),
    }
    const linha = computeScanner(semPeso, buildPriceIndex(snap), PADRAO)[0]!
    expect(linha.profitPerWeight).toBeNull()
  })
})

describe('procedência', () => {
  test('a idade da linha é a da observação mais velha que a sustenta', () => {
    const velho = OBSERVADO - 40_000
    const linha = rodar(
      snapshot([
        { item: 'T4_FIBER', location: '1002', sell: '100', sellAt: velho },
        { item: 'T3_CLOTH', location: '1002', sell: '200' },
        { item: 'T4_CLOTH', location: '1002', buy: '1000' },
      ]),
    )[0]!

    expect(linha.oldestObservedAt).toBe(velho)
  })
})

describe('lista de compras (task 4/11.2)', () => {
  const snap = snapshot([
    { item: 'T4_FIBER', location: '1002', sell: '100' },
    { item: 'T3_CLOTH', location: '1002', sell: '200' },
    { item: 'T4_CLOTH', location: '1002', buy: '1000' },
  ])

  test('pedir 1000 unidades multiplica a quantidade de cada ingrediente', () => {
    // A receita é 2×T4_FIBER + 1×T3_CLOTH por unidade produzida.
    const linha = rodar(snap, { quantity: 1000 })[0]!

    expect(linha.ingredients.map((i) => [i.item, i.purchaseQuantity])).toEqual([
      ['T4_FIBER', 2000],
      ['T3_CLOTH', 1000],
    ])
  })

  test('o subtotal é quantidade × preço unitário', () => {
    const linha = rodar(snap, { quantity: 1000 })[0]!

    expect(linha.ingredients[0]!.unitPrice?.toString()).toBe('100')
    expect(linha.ingredients[0]!.subtotal?.toString()).toBe('200000') // 2000 × 100
    expect(linha.ingredients[1]!.subtotal?.toString()).toBe('200000') // 1000 × 200
  })

  test('a soma dos subtotais fecha com o custo total', () => {
    // O teste que impede a lista de compras de divergir do número que a linha exibe. Se um dia
    // as duas contas usarem caminhos diferentes, é aqui que aparece.
    const linha = rodar(snap, { quantity: 1000, stationFeePer100Nutrition: '390' })[0]!

    const somaIngredientes = linha.ingredients.reduce(
      (total, i) => total.plus(i.subtotal!),
      money('0'),
    )
    // custo total = ingredientes + taxa de aquisição + prata da receita + estação.
    // Neste cenário a aquisição é imediata (sem taxa) e a receita não cobra prata; sobra a
    // estação: 7,02 por execução × 1000 execuções.
    expect(linha.acquisitionMode).toBe('immediate')
    expect(linha.totalCost?.toString()).toBe(
      somaIngredientes.plus(7.02 * 1000).toString(),
    )
  })

  test('a lista de compras é a das receitas iniciais, sem desconto do retorno', () => {
    // O jogador vai ao mercado **antes** de refinar: ele precisa comprar o suficiente para as
    // 1000 receitas que pretende fazer. O que voltar vira refino extra depois, e apertar isso
    // na lista de compras mandaria comprar de menos.
    const linha = rodar(snap, { quantity: 1000, returnRate: '0.5' })[0]!

    expect(linha.ingredients[0]!.purchaseQuantity).toBe(2000)
    expect(linha.ingredients[1]!.purchaseQuantity).toBe(1000)
    expect(linha.executions).toBe(2000) // floor(1000 / 0,5)
  })

  test('o preço unitário exibido é o do cenário VENCEDOR, não sempre o imediato', () => {
    const comOrdem = snapshot([
      { item: 'T4_FIBER', location: '1002', sell: '100', buy: '10' },
      { item: 'T3_CLOTH', location: '1002', sell: '200', buy: '20' },
      { item: 'T4_CLOTH', location: '1002', buy: '1000' },
    ])
    const linha = rodar(comOrdem)[0]!

    expect(linha.acquisitionMode).toBe('buy_order')
    expect(linha.ingredients[0]!.unitPrice?.toString()).toBe('10')
  })

  test('a lista de compras existe mesmo sem preço nenhum', () => {
    // Saber QUE precisa de 2000 fibras é útil antes de saber quanto custam.
    const linha = rodar(snapshot([]), { quantity: 1000 })[0]!

    expect(linha.state).toBe('missing_output_price')
    expect(linha.ingredients.map((i) => i.purchaseQuantity)).toEqual([2000, 1000])
    expect(linha.ingredients[0]!.subtotal).toBeNull()
  })

  test('foco consumido é foco por execução × execuções', () => {
    // A receita gasta 100 de foco por execução; 1000 execuções.
    expect(rodar(snap, { quantity: 1000, useFocus: true })[0]!.focusConsumed).toBe(100_000)
    expect(rodar(snap, { quantity: 1000, useFocus: false })[0]!.focusConsumed).toBe(0)
  })
})

describe('ordem estrutural (task 4/19)', () => {
  // Os testes de `sortRows` montam as linhas à mão, já com `tier`. Sem estes, a ordenação
  // passaria mesmo com o engine nunca preenchendo o campo — e a tabela ordenaria tudo como
  // "sem tier", em silêncio.
  test('a linha carrega o tier e o encantamento da saída', () => {
    const linha = rodar(
      snapshot([
        { item: 'T4_FIBER', location: '1002', sell: '100' },
        { item: 'T3_CLOTH', location: '1002', sell: '200' },
        { item: 'T4_CLOTH', location: '1002', buy: '1000' },
      ]),
      { quantity: 1 },
    )[0]!

    expect(linha.state).toBe('priced')
    expect(linha.tier).toBe(4)
    expect(linha.enchantmentLevel).toBe(0)
  })

  test('linha SEM preço também carrega — é justamente ela que mantém a posição do tier', () => {
    const linha = rodar(snapshot([]), { quantity: 1 })[0]!

    expect(linha.state).not.toBe('priced')
    expect(linha.tier).toBe(4)
  })
})

describe('o que a tabela enxuta precisa (task 4/20)', () => {
  const COM_PRECO = () =>
    snapshot([
      { item: 'T4_FIBER', location: '1002', sell: '100' },
      { item: 'T3_CLOTH', location: '1002', sell: '200' },
      { item: 'T4_CLOTH', location: '1002', buy: '1000' },
    ])

  test('a linha diz por quanto se vende, de quando e de onde é esse preço', () => {
    // Com a cidade virando parte da célula de Venda, a linha precisa carregar o preço unitário
    // e a procedência dele — até aqui isso só existia no painel (`explainRow`).
    const linha = rodar(COM_PRECO(), { quantity: 1 })[0]!

    expect(linha.saleUnitPrice?.toString()).toBe('1000')
    expect(linha.saleObservedAt).not.toBeNull()
    expect(linha.saleSource).not.toBeNull()
  })

  test('cada ingrediente carrega a idade do preço usado', () => {
    const linha = rodar(COM_PRECO(), { quantity: 1 })[0]!

    expect(linha.ingredients.length).toBeGreaterThan(0)
    // `typeof`, não `!== null`: sem o campo, `undefined !== null` é verdadeiro e o teste
    // passava contra o código antigo — foi o que aconteceu na primeira versão dele.
    expect(linha.ingredients.map((i) => typeof i.observedAt)).toEqual(
      linha.ingredients.map(() => 'number'),
    )
  })

  test('linha sem preço: venda ausente, nunca zero', () => {
    const linha = rodar(snapshot([]), { quantity: 1 })[0]!

    expect(linha.saleUnitPrice).toBeNull()
    expect(linha.saleObservedAt).toBeNull()
    expect(linha.ingredients.every((i) => i.observedAt === null)).toBe(true)
  })
})

describe('origem da venda escolhida por item (task 24)', () => {
  // A mesma receita em duas cidades: ingredientes iguais, e o tecido paga 1000 em 1002 e 1800 em
  // 3005 (lado `buy`, venda imediata).
  const DUAS_CIDADES = () =>
    snapshot([
      { item: 'T4_FIBER', location: '1002', sell: '100' },
      { item: 'T3_CLOTH', location: '1002', sell: '200' },
      { item: 'T4_CLOTH', location: '1002', buy: '1000' },
      { item: 'T4_FIBER', location: '3005', sell: '100' },
      { item: 'T3_CLOTH', location: '3005', sell: '200' },
      { item: 'T4_CLOTH', location: '3005', buy: '1800' },
    ])

  const venda = (
    saleByItem: Map<string, string>,
    extra: Partial<ScannerParams> = {},
    manualSale = new Map<string, string>(),
  ): Partial<ScannerParams> => ({
    locations: ['1002'],
    priceLocations: ['1002', '3005'],
    pricing: { ...PADRAO.pricing, base: { kind: 'average' }, saleByItem, manualSale },
    ...extra,
  })

  test('cidade escolhida gera linha só nela — mesmo desmarcada em Vender em', () => {
    // Vender em só tem 1002; a escolha do item é Caerleon. A escolha mais explícita vence.
    const linhas = rodar(DUAS_CIDADES(), venda(new Map([['T4_CLOTH', '3005']])))

    expect(linhas.map((l) => l.locationId)).toEqual(['3005'])
    expect(linhas[0]!.saleUnitPrice?.toString()).toBe('1800')
    expect(linhas[0]!.saleBasis).toBe('city')
  })

  test('venda pela média diz que a base é média, e não finge uma cidade', () => {
    const linha = bestPerRecipe(
      rodar(
        DUAS_CIDADES(),
        venda(new Map([['T4_CLOTH', ORIGEM_MEDIA]]), { locations: ['1002', '3005'] }),
      ),
    )[0]!

    // (1000 + 1800) / 2
    expect(linha.saleUnitPrice?.toString()).toBe('1400')
    expect(linha.saleBasis).toBe('average')
    expect(linha.saleSource).toContain('média')
  })

  test('preço fixo diz que a base é fixa', () => {
    const linha = rodar(DUAS_CIDADES(), venda(new Map(), {}, new Map([['T4_CLOTH', '1234']])))[0]!
    expect(linha.saleBasis).toBe('manual')
  })

  test('sem escolha, a base é a cidade da linha', () => {
    const linha = rodar(DUAS_CIDADES(), venda(new Map()))[0]!
    expect(linha.saleBasis).toBe('city')
  })
})
