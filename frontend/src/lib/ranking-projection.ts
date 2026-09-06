import Decimal from 'decimal.js'

import type { components } from '@/api/schema'

import { money, percentageCharge, type Money } from './money'

/**
 * Camada "e se" do cliente (task 3.5/23) — porte de `ranking_service.py::_project_row`.
 *
 * O ranking materializado (task 03) chega com os **componentes neutros** por linha. Premium,
 * imposto, taxa de retorno, custo de estação e foco são transformações baratas sobre esses
 * números — aplicadas aqui, no navegador, sem round-trip. Os vetores dourados
 * (`ranking-projection.golden.test.ts`) travam este porte string a string contra o Python.
 *
 * O que **não** é local: cidade, tier, encantamento, frescor, cobertura, lucro/ROI mínimo e a
 * ordenação — esses mudam *quais* linhas existem (ou a ordem sobre o universo completo) e
 * continuam no servidor (F08). Aqui só se muda o *valor* das linhas já carregadas.
 */

type RankingComponents = components['schemas']['RankingComponentsOut']

const PREMIUM_SALES_TAX_RATE = new Decimal('0.04')
const NON_PREMIUM_SALES_TAX_RATE = new Decimal('0.08')
const SETUP_FEE_RATE = new Decimal('0.025')
const ZERO = new Decimal(0)
const ONE = new Decimal(1)

export interface ProjectionParams {
  premium: boolean
  /** string decimal em [0,1] */
  returnRate: string
  /** string decimal, silver por execução */
  stationCostPerExecution: string
  useFocus: boolean
}

export interface ProjectedResult {
  acquisitionMode: 'immediate' | 'buy_order'
  saleMode: 'immediate' | 'sell_order'
  grossRevenue: Money
  salesTax: Money
  saleSetupFee: Money
  netRevenue: Money
  acquisitionSetupFee: Money
  totalFees: Money
  totalCost: Money
  profit: Money
  roi: Money | null
  stationCost: Money
  focusConsumed: number
  oldestObservedAt: string | null
}

function earliest(
  a: string | null | undefined,
  b: string | null | undefined,
): string | null {
  const dates = [a, b].filter((value): value is string => Boolean(value))
  if (dates.length === 0) return null
  return dates.reduce((min, value) => (value < min ? value : min))
}

/**
 * Melhor cenário (aquisição × venda) para uma linha do ranking, dados os controles "e se".
 * `null` quando não há oferta nem procura suficiente em nenhum lado.
 */
export function projectRankingRow(
  c: RankingComponents,
  params: ProjectionParams,
): ProjectedResult | null {
  const salesTaxRate = params.premium
    ? PREMIUM_SALES_TAX_RATE
    : NON_PREMIUM_SALES_TAX_RATE
  const returnRate = money(params.returnRate)
  const recipeTotal = money(c.recipe_silver_cost).times(c.executions)
  const stationTotal = money(params.stationCostPerExecution).times(c.executions)
  const returnFactor = ONE.minus(returnRate)

  const acqOptions: Array<
    ['immediate' | 'buy_order', string | null | undefined]
  > = [
    ['immediate', c.ingredient_cost_immediate],
    ['buy_order', c.ingredient_cost_order],
  ]
  const saleOptions: Array<
    [
      'immediate' | 'sell_order',
      string | null | undefined,
      string | null | undefined,
    ]
  > = [
    ['immediate', c.output_gross_immediate, c.output_immediate_observed_at],
    ['sell_order', c.output_gross_order, c.output_order_observed_at],
  ]

  let best: ProjectedResult | null = null
  for (const [acquisitionMode, ingredientCost] of acqOptions) {
    if (ingredientCost == null) continue
    const projectedIngredientCost = money(ingredientCost).times(returnFactor)
    const acquisitionSetupFee =
      acquisitionMode === 'buy_order'
        ? percentageCharge(projectedIngredientCost, SETUP_FEE_RATE)
        : ZERO
    const totalCost = projectedIngredientCost
      .plus(recipeTotal)
      .plus(stationTotal)
      .plus(acquisitionSetupFee)

    for (const [saleMode, gross, outObserved] of saleOptions) {
      if (gross == null) continue
      const grossRevenue = money(gross)
      const salesTax = percentageCharge(grossRevenue, salesTaxRate)
      const saleSetupFee =
        saleMode === 'sell_order'
          ? percentageCharge(grossRevenue, SETUP_FEE_RATE)
          : ZERO
      const netRevenue = grossRevenue.minus(salesTax).minus(saleSetupFee)
      const profit = netRevenue.minus(totalCost)
      const roi = totalCost.greaterThan(0)
        ? profit
            .div(totalCost)
            .times(100)
            .toDecimalPlaces(4, Decimal.ROUND_HALF_EVEN)
        : null

      const candidate: ProjectedResult = {
        acquisitionMode,
        saleMode,
        grossRevenue,
        salesTax,
        saleSetupFee,
        netRevenue,
        acquisitionSetupFee,
        totalFees: salesTax.plus(saleSetupFee).plus(acquisitionSetupFee),
        totalCost,
        profit,
        roi,
        stationCost: stationTotal,
        focusConsumed: params.useFocus ? c.crafting_focus * c.executions : 0,
        oldestObservedAt: earliest(
          c.ingredients_oldest_observed_at,
          outObserved,
        ),
      }
      if (best === null || candidate.profit.greaterThan(best.profit)) {
        best = candidate
      }
    }
  }
  return best
}

type Opportunity = components['schemas']['OpportunityOut']

/**
 * Aplica a projeção a uma linha de oportunidade, devolvendo uma cópia com os campos
 * financeiros recalculados. Linhas sem `components` (flip) voltam intactas.
 */
export function applyProjection(
  row: Opportunity,
  params: ProjectionParams,
): Opportunity {
  if (!row.components) return row
  const projected = projectRankingRow(row.components, params)
  if (!projected) return row
  const produced = row.components.produced_quantity
  return {
    ...row,
    total_cost: projected.totalCost.toString(),
    gross_revenue: projected.grossRevenue.toString(),
    sales_tax: projected.salesTax.toString(),
    sale_setup_fee: projected.saleSetupFee.toString(),
    net_revenue: projected.netRevenue.toString(),
    acquisition_setup_fee: projected.acquisitionSetupFee.toString(),
    total_fees: projected.totalFees.toString(),
    profit: projected.profit.toString(),
    roi: projected.roi ? projected.roi.toString() : null,
    acquisition_mode: projected.acquisitionMode,
    sale_mode: projected.saleMode,
    station_cost: projected.stationCost.toString(),
    focus_consumed: projected.focusConsumed,
    oldest_observed_at: projected.oldestObservedAt,
    buy_price: produced ? projected.totalCost.div(produced).toString() : null,
    sell_price: produced
      ? projected.grossRevenue.div(produced).toString()
      : null,
  }
}
