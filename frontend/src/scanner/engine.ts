import Decimal from 'decimal.js'

import type { components } from '@/api/schema'
import {
  calculateAcquisitionCost,
  calculateFocusConsumed,
  calculateIngredientRequirement,
  calculateProduction,
  calculateSaleRevenue,
  type AcquisitionMode,
  type SaleMode,
} from '@/lib/craft-formulas'
import { SETUP_FEE_RATE, salesTaxRateFor } from '@/lib/craft-constants'
import { add, divide, money, multiplyByQuantity, type Money } from '@/lib/money'

import {
  focusCostFor,
  refiningEfficiency,
  type DestinyBoard,
} from './focus-efficiency'
import type { PriceIndex } from './prices'
import {
  resolveIngredientPrice,
  resolveOutputPrice,
  type PricingPolicy,
  type ResolvedPrice,
  type ResolvedSide,
} from './pricing'

/**
 * Motor do scanner (task 4/05) — o cálculo que saiu do servidor.
 *
 * Compõe `@/lib/craft-formulas` (porte de `backend/src/craft/formulas.py`, travado por vetores
 * dourados desde a 3.5/18 e até aqui usado por nenhuma tela). Não reimplementa fórmula: se uma
 * conta precisa mudar, ela muda lá e os dois lados quebram juntos.
 *
 * **É uma estimativa de topo de livro**, não a simulação exata. O snapshot só tem o melhor
 * preço de cada lado — andar a profundidade exigiria baixar o livro inteiro. O número exato,
 * com slippage, continua vindo de `POST /craft/simulate` ("Analisar"). A tela precisa dizer
 * isso; esconder a diferença seria mentir.
 */

type CatalogRecipe = components['schemas']['CatalogRecipeOut']
type CatalogItem = components['schemas']['CatalogItemOut']

export interface ScannerCatalog {
  recipes: CatalogRecipe[]
  items: CatalogItem[]
}

/** `best` = o engine escolhe; um modo fixo = o jogador declara como opera. */
export interface ScannerStrategy {
  acquisition: AcquisitionMode | 'best'
  sale: SaleMode | 'best'
}

export const DEFAULT_STRATEGY: ScannerStrategy = { acquisition: 'best', sale: 'best' }

export interface ScannerParams {
  /** cidades de VENDA a avaliar; uma linha por receita × cidade */
  locations: string[]
  /**
   * Cidades consideradas ao cotar ingrediente (a média varre estas). Separado de `locations`
   * de propósito: filtrar onde se vende não pode encolher a base de preço da compra.
   */
  priceLocations: string[]
  /** de onde vem o preço de cada ingrediente (task 11.3) */
  pricing: PricingPolicy
  /**
   * Como o jogador compra e vende (task 11.5). `best` deixa o engine escolher o cenário mais
   * lucrativo — que **supõe as duas ordens sendo aceitas**. Travar num modo responde a outra
   * pergunta: quanto rende do jeito que eu de fato opero.
   */
  strategy: ScannerStrategy
  premium: boolean
  /** taxa em [0,1] — já convertida de percentual por `percentageToRate` */
  returnRate: string
  /** silver por execução */
  stationCostPerExecution: string
  useFocus: boolean
  /** qualidade da saída a cotar */
  outputQuality: number
  /**
   * Quantidade — o que ela conta depende de `quantityMeans`.
   */
  quantity: number
  /**
   * O que `quantity` conta:
   * - `initial_recipes` (a tela): quantas receitas o jogador faz com o que comprou. O retorno
   *   vira **execução extra**, não desconto na compra.
   * - `desired_output` (paridade com `simulate_craft`): quantas unidades ele quer no fim. O
   *   retorno vira **desconto na compra**. É o que o servidor recebe.
   *
   * As duas contas são a mesma série lida de lados opostos; o flag existe porque as duas
   * pontas do produto perguntam de jeitos diferentes.
   */
  quantityMeans: 'initial_recipes' | 'desired_output'
  /**
   * O Painel do Destino do jogador (task 4/17). Vazio = custo de foco do dump, que é o de quem
   * nunca especializou nada. Nó preenchido derruba o custo, e muito.
   */
  destinyBoard: DestinyBoard
}

/**
 * Por que a linha não tem número. Nunca ausência de linha — é exatamente o `X01`/`X02`
 * resolvido na camada de cálculo: o produto mostra a receita e diz o que falta.
 */
export type ScannerState =
  | 'priced'
  | 'missing_ingredient_price'
  | 'missing_output_price'
  | 'no_price'

/** Um ingrediente da receita, com a lista de compras já calculada (task 4/11.2). */
export interface ScannerIngredient {
  item: string
  enchantmentLevel: number
  /** unidades a comprar para a quantidade pedida, já com retorno e teto de unidade inteira */
  purchaseQuantity: number
  /** preço unitário do cenário vencedor — `null` quando o ingrediente não tem cotação */
  unitPrice: Money | null
  /** `purchaseQuantity × unitPrice` */
  subtotal: Money | null
}

export interface ScannerRow {
  outputItem: string
  locationId: string
  productionKind: string
  state: ScannerState

  // Preenchidos só quando `state === 'priced'`.
  acquisitionMode: AcquisitionMode | null
  saleMode: SaleMode | null
  totalCost: Money | null
  /** `totalCost ÷ producedQuantity` — todos os custos por item pronto */
  averageUnitCost: Money | null
  grossRevenue: Money | null
  salesTax: Money | null
  totalFees: Money | null
  netRevenue: Money | null
  profit: Money | null
  /** percentual, 4 casas */
  roi: Money | null
  /** lucro por kg transportado — a métrica da planilha */
  profitPerWeight: Money | null
  /** lucro por ponto de foco gasto */
  profitPerFocus: Money | null

  executions: number
  producedQuantity: number
  focusConsumed: number
  /** epoch em segundos da observação mais velha que sustenta a linha */
  oldestObservedAt: number | null
  /** fontes distintas por trás dos preços usados */
  sources: string[]
  /** a lista de compras: um item por ingrediente da receita, na ordem original */
  ingredients: ScannerIngredient[]
}

/** Um dos quatro cenários, com o número que ele produziria (task 4/11.4). */
export interface ScannerScenarioResult {
  acquisitionMode: AcquisitionMode
  saleMode: SaleMode
  totalCost: Money
  netRevenue: Money
  profit: Money
  roi: Money | null
  /** o cenário que a linha da tabela mostra */
  best: boolean
}

/** O extrato do cenário vencedor: de onde vem cada silver. */
export interface ScannerBreakdown {
  ingredientCost: Money
  acquisitionSetupFee: Money
  recipeSilver: Money
  stationCost: Money
  totalCost: Money
  grossRevenue: Money
  salesTax: Money
  saleSetupFee: Money
  netRevenue: Money
}

/** Ingrediente com a procedência do preço — de onde veio e de quando. */
export interface ScannerIngredientDetail extends ScannerIngredient {
  source: string | null
  observedAt: number | null
  /** os dois lados cotados, para comparar os cenários */
  immediatePrice: Money | null
  orderPrice: Money | null
}

export interface ScannerDetail {
  row: ScannerRow
  scenarios: ScannerScenarioResult[]
  breakdown: ScannerBreakdown
  ingredients: ScannerIngredientDetail[]
  /** menor preço unitário de venda que empata */
  breakEvenUnitPrice: Money | null
}

/** Preenchido só quando a tela pede explicação — o caminho normal não paga por isso. */
interface Coletor {
  scenarios: ScannerScenarioResult[]
  breakdown: ScannerBreakdown | null
  ingredients: ScannerIngredientDetail[]
}

interface Quote {
  price: Money
  /** `null` = preço digitado pelo jogador; não tem idade e não entra no frescor da linha */
  observedAt: number | null
  source: string
}

function quoteResolvido(side: ResolvedSide | null): Quote | null {
  return side === null
    ? null
    : { price: money(side.price), observedAt: side.observedAt, source: side.source }
}

/**
 * Uma **sessão** de refino (task 4/11.6): o jogador compra para `receitasIniciais` receitas,
 * refina, e refina de novo o que voltar — até acabar.
 *
 *     execuções totais = N × (1 + r + r² + …) = N / (1 − r)
 *
 * O piso é deliberado: meia execução não existe, e arredondar para cima anunciaria um item que
 * o retorno não pagou.
 */
function producaoDaSessao(
  receitasIniciais: number,
  amountCrafted: number,
  returnRate: string,
): ReturnType<typeof calculateProduction> {
  const sobra = new Decimal(1).minus(money(returnRate))
  const executions = sobra.greaterThan(0)
    ? divide(receitasIniciais, sobra).floor().toNumber()
    : receitasIniciais
  return {
    executions,
    producedQuantity: executions * amountCrafted,
    surplusQuantity: 0,
  }
}

/** As constantes de uma receita que não dependem da cidade — calculadas uma vez por receita. */
function prepararReceita(
  recipe: CatalogRecipe,
  params: ScannerParams,
  itemsByName: Map<string, CatalogItem>,
) {
  const saida = itemsByName.get(recipe.output_item)
  const sessao = params.quantityMeans === 'initial_recipes'
  const production = sessao
    ? producaoDaSessao(params.quantity, recipe.amount_crafted, params.returnRate)
    : calculateProduction(params.quantity, recipe.amount_crafted)

  return {
    production,
    /**
     * Quanto comprar, e com qual desconto.
     *
     * Na **sessão**, nenhum: a compra é para as receitas iniciais, e o retorno aparece como
     * execução a mais — não como fibra a menos na lista de compras. No modo do servidor é o
     * contrário: a meta é a saída, e o retorno desconta a compra.
     */
    compra: sessao
      ? { executions: params.quantity, returnRate: '0' }
      : { executions: production.executions, returnRate: params.returnRate },
    focusConsumed: calculateFocusConsumed(
      focoPorExecucao(recipe, saida, params),
      production.executions,
      params.useFocus,
    ),
    recipeSilver: multiplyByQuantity(recipe.silver_cost, production.executions),
    stationTotal: multiplyByQuantity(
      money(params.stationCostPerExecution),
      production.executions,
    ),
    salesTaxRate: salesTaxRateFor(params.premium),
    returnRate: params.returnRate,
    // Nível de encantamento da SAÍDA vem da coluna da receita, não do sufixo `@N` do nome:
    // `craft/service.py:180-184` monta o combo da saída com `recipe["enchantment_level"]`.
    // Derivar do nome seria uma segunda fonte de verdade, livre para divergir.
    outputEnchantment: recipe.enchantment_level,
    outputWeight: saida?.weight ?? null,
  }
}

/**
 * Foco por execução com a especialização do jogador aplicada.
 *
 * **Inteiro, arredondado para cima, por execução.** O jogo cobra ponto inteiro de foco por
 * craft; mostrar `14,36` seria um número que o jogador não vê em lugar nenhum. E o arredondamento
 * é por execução, não no total: três refinos de 15 custam 45, não `ceil(3 × 14,3587) = 44`.
 *
 * Só refino por enquanto: o craft usa a mesma fórmula, mas a árvore tem outra forma e outros
 * coeficientes (ver `focus-efficiency.ts`). Chamar a conta do refino para uma receita de craft
 * daria zero de eficiência — silenciosamente certo hoje, silenciosamente errado amanhã —, então
 * o tipo de produção decide explicitamente.
 */
function focoPorExecucao(
  recipe: CatalogRecipe,
  saida: CatalogItem | undefined,
  params: ScannerParams,
): number {
  if (recipe.production_kind !== 'refining') return recipe.crafting_focus
  if (!saida?.crafting_category || saida.tier == null) return recipe.crafting_focus

  return Math.ceil(
    focusCostFor(
      recipe.crafting_focus,
      refiningEfficiency(saida.crafting_category, saida.tier, params.destinyBoard),
    ),
  )
}

function porNome(catalog: ScannerCatalog): Map<string, CatalogItem> {
  return new Map(catalog.items.map((item) => [item.unique_name, item]))
}

export function computeScanner(
  catalog: ScannerCatalog,
  prices: PriceIndex,
  params: ScannerParams,
): ScannerRow[] {
  const itemsByName = porNome(catalog)
  const rows: ScannerRow[] = []
  /** Vive por chamada: um snapshot novo tem médias novas. */
  const cacheDaMedia = new Map<string, ResolvedPrice>()

  for (const recipe of catalog.recipes) {
    const base = prepararReceita(recipe, params, itemsByName)
    for (const locationId of params.locations) {
      rows.push(evaluate({ ...base, recipe, locationId, prices, params, cacheDaMedia }))
    }
  }

  return rows
}

/**
 * Tudo o que a linha esconde, para **uma** receita numa cidade (task 4/11.4).
 *
 * Roda o mesmo `evaluate` da tabela com um coletor ligado — não é uma segunda conta. Fosse uma
 * reimplementação, o extrato poderia discordar da linha que ele explica, que é o pior defeito
 * possível num extrato.
 *
 * Só a linha expandida paga por isso; as outras não calculam nada disso.
 */
export function explainRow(
  catalog: ScannerCatalog,
  prices: PriceIndex,
  params: ScannerParams,
  alvo: { outputItem: string; locationId: string },
): ScannerDetail | null {
  const recipe = catalog.recipes.find((r) => r.output_item === alvo.outputItem)
  if (!recipe) return null

  const coletor: Coletor = { scenarios: [], breakdown: null, ingredients: [] }
  const row = evaluate({
    ...prepararReceita(recipe, params, porNome(catalog)),
    recipe,
    locationId: alvo.locationId,
    prices,
    params,
    cacheDaMedia: new Map(),
    coletor,
  })

  if (coletor.breakdown === null) return null

  const vencedor = coletor.scenarios.find((cenario) => cenario.best)
  return {
    row,
    scenarios: coletor.scenarios,
    breakdown: coletor.breakdown,
    ingredients: coletor.ingredients,
    breakEvenUnitPrice: vencedor ? breakEven(row, vencedor, params) : null,
  }
}

/**
 * Menor preço unitário de venda que empata com o custo, já contando imposto e — no modo ordem
 * de venda — a taxa de montagem.
 *
 * **Aproximação linear**: no jogo cada cobrança arredonda para cima isoladamente, então o
 * empate real fica alguns silver acima. A diferença é de centavos por unidade, e o número
 * serve para decidir, não para fechar caixa.
 */
function breakEven(
  row: ScannerRow,
  vencedor: ScannerScenarioResult,
  params: ScannerParams,
): Money | null {
  if (row.producedQuantity <= 0) return null
  const retido =
    vencedor.saleMode === 'sell_order'
      ? salesTaxRateFor(params.premium).plus(SETUP_FEE_RATE)
      : salesTaxRateFor(params.premium)
  const sobra = new Decimal(1).minus(retido)
  if (!sobra.greaterThan(0)) return null
  return divide(divide(vencedor.totalCost, sobra), row.producedQuantity)
}

/**
 * Uma linha por receita: a de maior lucro entre as cidades avaliadas (task 4/11.3).
 *
 * Com o preço do ingrediente desatado da cidade, as linhas de uma mesma receita passam a
 * diferir **só por onde se vende** — e mil linhas para dizer isso é ruído. A cidade vencedora
 * continua visível na coluna `Cidade`, então a redução não esconde a escolha, só a resolve.
 *
 * Linha sem preço perde para qualquer linha com preço, mas **sobrevive** quando a receita não
 * tem nenhuma: reduzir não pode virar um jeito novo de a receita sumir (`X01`).
 */
export function bestPerRecipe(rows: ScannerRow[]): ScannerRow[] {
  const melhor = new Map<string, ScannerRow>()

  for (const row of rows) {
    const atual = melhor.get(row.outputItem)
    if (atual === undefined) {
      melhor.set(row.outputItem, row)
      continue
    }
    const temPreco = row.profit !== null
    const atualTemPreco = atual.profit !== null
    if (!temPreco) continue
    if (!atualTemPreco || row.profit!.greaterThan(atual.profit!)) {
      melhor.set(row.outputItem, row)
    }
  }

  return [...melhor.values()]
}

interface EvaluateInput {
  recipe: CatalogRecipe
  locationId: string
  prices: PriceIndex
  params: ScannerParams
  production: ReturnType<typeof calculateProduction>
  focusConsumed: number
  compra: { executions: number; returnRate: string }
  recipeSilver: Money
  stationTotal: Money
  salesTaxRate: Decimal
  returnRate: string
  outputEnchantment: number
  outputWeight: string | null
  cacheDaMedia: Map<string, ResolvedPrice>
  coletor?: Coletor
}

function emptyRow(
  input: EvaluateInput,
  state: ScannerState,
): ScannerRow {
  return {
    outputItem: input.recipe.output_item,
    locationId: input.locationId,
    productionKind: input.recipe.production_kind,
    state,
    acquisitionMode: null,
    saleMode: null,
    totalCost: null,
    averageUnitCost: null,
    grossRevenue: null,
    salesTax: null,
    totalFees: null,
    netRevenue: null,
    profit: null,
    roi: null,
    profitPerWeight: null,
    profitPerFocus: null,
    executions: input.production.executions,
    producedQuantity: input.production.producedQuantity,
    focusConsumed: input.focusConsumed,
    oldestObservedAt: null,
    sources: [],
    // A lista de compras existe mesmo sem preço: saber QUE precisa de 3000 fibras é útil
    // antes de saber quanto custam.
    ingredients: input.recipe.ingredients.map((ingredient) => ({
      item: ingredient.item,
      enchantmentLevel: ingredient.enchantment_level,
      purchaseQuantity: calculateIngredientRequirement(
        ingredient.count,
        input.compra.executions,
        input.compra.returnRate,
      ).purchaseQuantity,
      unitPrice: null,
      subtotal: null,
    })),
  }
}

function evaluate(input: EvaluateInput): ScannerRow {
  const { recipe, locationId, prices, params } = input

  // --- Saída: os dois modos de venda ---
  const outputPrice = resolveOutputPrice(prices, params.pricing, {
    item: recipe.output_item,
    quality: params.outputQuality,
    enchantmentLevel: input.outputEnchantment,
    locationId,
  })
  // Vender imediato = entregar para a maior ordem de compra (`buy`).
  // Ordem de venda   = anunciar junto da oferta mais barata (`sell`).
  // A estratégia recorta os modos ANTES da escolha. Sem isso, travar em "venda imediata" e
  // continuar mostrando o lucro da ordem de venda seria pior que não ter o controle.
  const saleOptions: Array<[SaleMode, Quote | null]> = (
    [
      ['immediate', quoteResolvido(outputPrice.buy)],
      ['sell_order', quoteResolvido(outputPrice.sell)],
    ] as Array<[SaleMode, Quote | null]>
  ).filter(([modo]) => params.strategy.sale === 'best' || params.strategy.sale === modo)
  if (saleOptions.every(([, quote]) => quote === null)) {
    return emptyRow(input, 'missing_output_price')
  }

  // --- Ingredientes: os dois modos de aquisição ---
  // Os custos por ingrediente ficam separados de propósito. A taxa de montagem é
  // `ceil(base × 2,5%)` cobrada **por ingrediente**, como `craft/service.py::_build_scenario`
  // faz (`acquisition_parts` somando `part.setup_fee`) — somar antes de arredondar daria
  // outro número: dois ingredientes de 100 dão ceil(2,5)+ceil(2,5)=6, não ceil(5)=5.
  let immediateOk = true
  let orderOk = true
  const ingredientObserved: number[] = []
  const usedSources = new Set<string>()

  // A cotação de cada ingrediente fica **junto do ingrediente**, não só num total anônimo: é
  // isso que permite a tabela mostrar a lista de compras (task 11.2). Antes o cálculo já tinha
  // esses números e os descartava.
  const detalhes: Array<{
    item: string
    enchantmentLevel: number
    purchaseQuantity: number
    immediate: Quote | null
    order: Quote | null
  }> = []

  for (const ingredient of recipe.ingredients) {
    const requirement = calculateIngredientRequirement(
      ingredient.count,
      input.compra.executions,
      input.compra.returnRate,
    )
    // O preço do ingrediente vem da POLÍTICA, não da cidade da linha (task 11.3): média das
    // cidades, cidade fixa, preço na mão. A cidade da linha decide onde se **vende**.
    const cotado = resolveIngredientPrice(
      prices,
      params.pricing,
      params.priceLocations,
      {
        item: ingredient.item,
        enchantmentLevel: ingredient.enchantment_level,
        saleLocationId: locationId,
      },
      input.cacheDaMedia,
    )

    // Comprar imediato = pegar a oferta mais barata (`sell`).
    // Ordem de compra  = entrar na fila da maior ordem de compra (`buy`).
    const immediate = quoteResolvido(cotado.sell)
    const order = quoteResolvido(cotado.buy)

    if (immediate === null) immediateOk = false
    else {
      if (immediate.observedAt !== null) ingredientObserved.push(immediate.observedAt)
      usedSources.add(immediate.source)
    }
    if (order === null) orderOk = false
    else {
      if (order.observedAt !== null) ingredientObserved.push(order.observedAt)
      usedSources.add(order.source)
    }

    detalhes.push({
      item: ingredient.item,
      enchantmentLevel: ingredient.enchantment_level,
      purchaseQuantity: requirement.purchaseQuantity,
      immediate,
      order,
    })
  }

  if (input.coletor) {
    // A quantidade e o preço unitário aqui ainda são "por modo"; o `unitPrice`/`subtotal` do
    // vencedor é preenchido no laço abaixo, junto com o cenário que ganhar.
    input.coletor.ingredients = detalhes.map((d) => ({
      item: d.item,
      enchantmentLevel: d.enchantmentLevel,
      purchaseQuantity: d.purchaseQuantity,
      unitPrice: null,
      subtotal: null,
      source: null,
      observedAt: null,
      immediatePrice: d.immediate?.price ?? null,
      orderPrice: d.order?.price ?? null,
    }))
  }

  /** Subtotal por ingrediente no modo escolhido — a mesma base do `setup_fee` por ingrediente. */
  const totaisPara = (modo: AcquisitionMode): Money[] =>
    detalhes.map((d) =>
      multiplyByQuantity(
        (modo === 'immediate' ? d.immediate : d.order)!.price,
        d.purchaseQuantity,
      ),
    )

  const acquisitionOptions: Array<[AcquisitionMode, Money[] | null]> = (
    [
      ['immediate', immediateOk ? totaisPara('immediate') : null],
      ['buy_order', orderOk ? totaisPara('buy_order') : null],
    ] as Array<[AcquisitionMode, Money[] | null]>
  ).filter(
    ([modo]) =>
      params.strategy.acquisition === 'best' || params.strategy.acquisition === modo,
  )
  if (acquisitionOptions.every(([, totals]) => totals === null)) {
    return emptyRow(input, 'missing_ingredient_price')
  }

  // --- Os 4 cenários; o mais lucrativo vence ---
  let best: ScannerRow | null = null

  for (const [acquisitionMode, ingredientTotals] of acquisitionOptions) {
    if (ingredientTotals === null) continue
    // Taxa por ingrediente, somada depois — a mesma ordem de `_build_scenario`.
    const parts = ingredientTotals.map((total) =>
      calculateAcquisitionCost(total, acquisitionMode, SETUP_FEE_RATE),
    )
    const ingredientCost = add(...parts.map((part) => part.quotedCost))
    const acquisitionSetupFee = add(...parts.map((part) => part.setupFee))
    const totalCost = add(
      ingredientCost,
      acquisitionSetupFee,
      input.recipeSilver,
      input.stationTotal,
    )

    for (const [saleMode, quote] of saleOptions) {
      if (quote === null) continue
      const observados =
        quote.observedAt === null
          ? ingredientObserved
          : [...ingredientObserved, quote.observedAt]
      const grossRevenue = multiplyByQuantity(
        quote.price,
        input.production.producedQuantity,
      )
      const sale = calculateSaleRevenue(
        grossRevenue,
        saleMode,
        input.salesTaxRate,
        SETUP_FEE_RATE,
      )
      const profit = sale.netRevenue.minus(totalCost)

      const roiDe = (valor: Money) =>
        totalCost.greaterThan(0)
          ? divide(valor, totalCost).times(100).toDecimalPlaces(4, Decimal.ROUND_HALF_EVEN)
          : null

      // O cenário perdedor só é materializado quando alguém pediu a explicação — no caminho
      // normal os três perdedores continuam sendo descartados sem custo.
      input.coletor?.scenarios.push({
        acquisitionMode,
        saleMode,
        totalCost,
        netRevenue: sale.netRevenue,
        profit,
        roi: roiDe(profit),
        best: false, // marcado no fim, quando o vencedor é conhecido
      })

      if (best !== null && best.profit !== null && !profit.greaterThan(best.profit)) {
        continue
      }

      const roi = roiDe(profit)

      const totalWeight =
        input.outputWeight === null
          ? null
          : multiplyByQuantity(
              input.outputWeight,
              input.production.producedQuantity,
            )

      best = {
        outputItem: recipe.output_item,
        locationId,
        productionKind: recipe.production_kind,
        state: 'priced',
        acquisitionMode,
        saleMode,
        totalCost,
        // Custo médio do item pronto: ingredientes + taxa de montagem + prata da receita +
        // estação, dividido pelo que saiu. O retorno de recurso entra aqui **baixando o
        // custo** — na nossa modelagem ele compra menos para produzir o mesmo, em vez de
        // produzir mais com a mesma compra. As duas leituras dão o mesmo custo por item.
        averageUnitCost:
          input.production.producedQuantity > 0
            ? divide(totalCost, input.production.producedQuantity)
            : null,
        grossRevenue,
        salesTax: sale.salesTax,
        totalFees: add(sale.salesTax, sale.setupFee, acquisitionSetupFee),
        netRevenue: sale.netRevenue,
        profit,
        roi,
        profitPerWeight:
          totalWeight !== null && totalWeight.greaterThan(0)
            ? divide(profit, totalWeight)
            : null,
        profitPerFocus:
          input.focusConsumed > 0 ? divide(profit, input.focusConsumed) : null,
        executions: input.production.executions,
        producedQuantity: input.production.producedQuantity,
        focusConsumed: input.focusConsumed,
        ingredients: detalhes.map((d) => {
          const cotacao = acquisitionMode === 'immediate' ? d.immediate : d.order
          return {
            item: d.item,
            enchantmentLevel: d.enchantmentLevel,
            purchaseQuantity: d.purchaseQuantity,
            unitPrice: cotacao?.price ?? null,
            subtotal: cotacao
              ? multiplyByQuantity(cotacao.price, d.purchaseQuantity)
              : null,
          }
        }),
        // Só entra aqui o que foi **observado**. Preço digitado não tem idade, e contá-lo
        // como "agora" faria a linha parecer fresca porque alguém digitou.
        //
        // Quando NADA foi observado — todo ingrediente e a venda com preço na mão — a idade é
        // ausência, não um número. `Math.min()` sem argumentos devolve `Infinity`, que virava
        // `new Date(Infinity).toISOString()` na coluna e derrubava a tela inteira.
        oldestObservedAt: observados.length > 0 ? Math.min(...observados) : null,
        sources: [...usedSources, quote.source].filter(
          (source, index, all) => all.indexOf(source) === index,
        ),
      }

      if (input.coletor) {
        input.coletor.breakdown = {
          ingredientCost,
          acquisitionSetupFee,
          recipeSilver: input.recipeSilver,
          stationCost: input.stationTotal,
          totalCost,
          grossRevenue,
          salesTax: sale.salesTax,
          saleSetupFee: sale.setupFee,
          netRevenue: sale.netRevenue,
        }
      }
    }
  }

  if (input.coletor && best !== null) {
    const vencedor = best
    const cenario = input.coletor.scenarios.find(
      (c) =>
        c.acquisitionMode === vencedor.acquisitionMode &&
        c.saleMode === vencedor.saleMode,
    )
    if (cenario) cenario.best = true

    // Procedência do preço **efetivamente usado**: a do modo que venceu, não a do imediato.
    input.coletor.ingredients = input.coletor.ingredients.map((detalhe, indice) => {
      const bruto = detalhes[indice]
      const cotacao =
        vencedor.acquisitionMode === 'immediate' ? bruto?.immediate : bruto?.order
      return {
        ...detalhe,
        unitPrice: vencedor.ingredients[indice]?.unitPrice ?? null,
        subtotal: vencedor.ingredients[indice]?.subtotal ?? null,
        source: cotacao?.source ?? null,
        observedAt: cotacao?.observedAt ?? null,
      }
    })
  }

  return best ?? emptyRow(input, 'no_price')
}
