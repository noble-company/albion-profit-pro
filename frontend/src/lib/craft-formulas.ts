import Decimal from 'decimal.js'

import {
  ceilToInteger,
  divide,
  money,
  percentageCharge,
  type Money,
  type MoneyInput,
} from './money'

/**
 * Porte das fórmulas puras de `backend/src/craft/formulas.py` que o cliente precisa para a
 * camada "e se" (task 23). Mesmos nomes (em camelCase), mesma ordem de arredondamento. A
 * referência é `docs/11-formulas-de-craft.md` — nada de reinterpretar. Os vetores dourados
 * (`craft-formulas.golden.test.ts`) travam este porte contra o motor Python.
 */

export type AcquisitionMode = 'immediate' | 'buy_order'
export type SaleMode = 'immediate' | 'sell_order'

export interface Production {
  executions: number
  producedQuantity: number
  surplusQuantity: number
}

export interface IngredientRequirement {
  grossQuantity: number
  expectedReturnQuantity: Money
  effectiveQuantity: Money
  purchaseQuantity: number
}

export interface AcquisitionCost {
  quotedCost: Money
  setupFee: Money
  totalCost: Money
}

export interface SaleRevenue {
  grossRevenue: Money
  setupFee: Money
  salesTax: Money
  netRevenue: Money
}

export interface FinancialResult {
  profit: Money
  profitPerUnit: Money
  roi: Money | null
}

const ZERO = new Decimal(0)
const ONE = new Decimal(1)

function validateRate(rate: Money): void {
  if (rate.lessThan(0) || rate.greaterThan(1)) {
    throw new RangeError('taxa deve estar entre 0 e 1')
  }
}

/** Arredonda uma Decimal não-negativa para cima até a unidade inteira comprável. */
export function ceilDecimal(value: MoneyInput): number {
  return ceilToInteger(value).toNumber()
}

/** Trunca para baixo, para apresentação. Nunca volta para uma fórmula. */
export function roundDownForDisplay(
  value: MoneyInput,
  decimalPlaces = 1,
): Money {
  return money(value).toDecimalPlaces(decimalPlaces, Decimal.ROUND_FLOOR)
}

export function calculateProduction(
  desiredQuantity: number,
  amountCrafted: number,
): Production {
  if (desiredQuantity <= 0) {
    throw new RangeError('desired_quantity deve ser positivo')
  }
  if (amountCrafted <= 0) {
    throw new RangeError('amount_crafted deve ser positivo')
  }
  const executions = Math.ceil(desiredQuantity / amountCrafted)
  const producedQuantity = executions * amountCrafted
  return {
    executions,
    producedQuantity,
    surplusQuantity: producedQuantity - desiredQuantity,
  }
}

export function calculateIngredientRequirement(
  countPerExecution: number,
  executions: number,
  returnRate: MoneyInput,
  returnEligible = true,
): IngredientRequirement {
  if (countPerExecution < 0) {
    throw new RangeError('count_per_execution deve ser não-negativo')
  }
  if (executions < 0) {
    throw new RangeError('executions deve ser não-negativo')
  }
  const rate = money(returnRate)
  validateRate(rate)
  const grossQuantity = countPerExecution * executions
  const appliedRate = returnEligible ? rate : ZERO
  const effectiveQuantity = new Decimal(grossQuantity).times(
    ONE.minus(appliedRate),
  )
  const expectedReturnQuantity = new Decimal(grossQuantity).minus(
    effectiveQuantity,
  )
  return {
    grossQuantity,
    expectedReturnQuantity,
    effectiveQuantity,
    purchaseQuantity: ceilDecimal(effectiveQuantity),
  }
}

export function calculateFocusConsumed(
  craftingFocus: number,
  executions: number,
  useFocus: boolean,
): number {
  if (craftingFocus < 0) {
    throw new RangeError('crafting_focus deve ser não-negativo')
  }
  if (executions < 0) {
    throw new RangeError('executions deve ser não-negativo')
  }
  return useFocus ? craftingFocus * executions : 0
}

/** `ceil(base × taxa)` — cada cobrança percentual arredondada para cima isoladamente. */
export function calculatePercentageCharge(
  base: MoneyInput,
  rate: MoneyInput,
): Money {
  return percentageCharge(base, rate)
}

export function calculateAcquisitionCost(
  quotedCost: MoneyInput,
  mode: AcquisitionMode,
  setupFeeRate: MoneyInput,
): AcquisitionCost {
  const quoted = money(quotedCost)
  if (quoted.isNegative()) {
    throw new RangeError('quoted_cost deve ser não-negativo')
  }
  validateRate(money(setupFeeRate))
  const setupFee =
    mode === 'buy_order' ? percentageCharge(quoted, setupFeeRate) : ZERO
  return { quotedCost: quoted, setupFee, totalCost: quoted.plus(setupFee) }
}

export function calculateSaleRevenue(
  grossRevenue: MoneyInput,
  mode: SaleMode,
  salesTaxRate: MoneyInput,
  setupFeeRate: MoneyInput,
): SaleRevenue {
  const gross = money(grossRevenue)
  if (gross.isNegative()) {
    throw new RangeError('gross_revenue deve ser não-negativo')
  }
  validateRate(money(salesTaxRate))
  validateRate(money(setupFeeRate))
  const salesTax = percentageCharge(gross, salesTaxRate)
  const setupFee =
    mode === 'sell_order' ? percentageCharge(gross, setupFeeRate) : ZERO
  return {
    grossRevenue: gross,
    setupFee,
    salesTax,
    netRevenue: gross.minus(setupFee).minus(salesTax),
  }
}

export function calculateFinancialResult(
  totalCost: MoneyInput,
  netRevenue: MoneyInput,
  producedQuantity: number,
): FinancialResult {
  const cost = money(totalCost)
  if (cost.isNegative()) {
    throw new RangeError('total_cost deve ser não-negativo')
  }
  const net = money(netRevenue)
  if (producedQuantity <= 0) {
    throw new RangeError('produced_quantity deve ser positivo')
  }
  const profit = net.minus(cost)
  return {
    profit,
    profitPerUnit: divide(profit, producedQuantity),
    roi: cost.isZero() ? null : divide(profit, cost),
  }
}
