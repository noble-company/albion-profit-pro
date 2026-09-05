import { readFileSync } from 'node:fs'

import { expect, test } from 'vitest'

import {
  calculateAcquisitionCost,
  calculateFinancialResult,
  calculateFocusConsumed,
  calculateIngredientRequirement,
  calculatePercentageCharge,
  calculateProduction,
  calculateSaleRevenue,
  ceilDecimal,
  roundDownForDisplay,
  type AcquisitionMode,
  type SaleMode,
} from './craft-formulas'

// F09 / task 3.5/18: os vetores dourados são gerados pelo motor Python
// (backend/scripts/generate_craft_vectors.py) e este teste roda o porte TS sobre eles.
// Se `craft/formulas.py` mudar sem regerar, o teste de Python quebra; se o porte divergir
// dos vetores regerados, este quebra. As duas implementações não podem divergir em silêncio.
type Vector = {
  fn: string
  args: Record<string, unknown>
  expected: unknown
}

const golden = JSON.parse(
  readFileSync('../backend/tests/fixtures/golden/craft-vectors.json', 'utf8'),
) as { vectors: Vector[]; rates: Record<string, string> }

function run(
  fn: string,
  a: Record<string, string | number | boolean>,
): unknown {
  switch (fn) {
    case 'ceil_decimal':
      return ceilDecimal(a.value as string)
    case 'round_down_for_display':
      return roundDownForDisplay(
        a.value as string,
        (a.decimal_places as number) ?? 1,
      ).toString()
    case 'calculate_production': {
      const p = calculateProduction(
        a.desired_quantity as number,
        a.amount_crafted as number,
      )
      return {
        executions: p.executions,
        produced_quantity: p.producedQuantity,
        surplus_quantity: p.surplusQuantity,
      }
    }
    case 'calculate_ingredient_requirement': {
      const r = calculateIngredientRequirement(
        a.count_per_execution as number,
        a.executions as number,
        a.return_rate as string,
        (a.return_eligible as boolean | undefined) ?? true,
      )
      return {
        gross_quantity: r.grossQuantity,
        expected_return_quantity: r.expectedReturnQuantity.toString(),
        effective_quantity: r.effectiveQuantity.toString(),
        purchase_quantity: r.purchaseQuantity,
      }
    }
    case 'calculate_focus_consumed':
      return calculateFocusConsumed(
        a.crafting_focus as number,
        a.executions as number,
        a.use_focus as boolean,
      )
    case 'calculate_percentage_charge':
      return calculatePercentageCharge(
        a.base as string,
        a.rate as string,
      ).toString()
    case 'calculate_acquisition_cost': {
      const c = calculateAcquisitionCost(
        a.quoted_cost as string,
        a.mode as AcquisitionMode,
        a.setup_fee_rate as string,
      )
      return {
        quoted_cost: c.quotedCost.toString(),
        setup_fee: c.setupFee.toString(),
        total_cost: c.totalCost.toString(),
      }
    }
    case 'calculate_sale_revenue': {
      const r = calculateSaleRevenue(
        a.gross_revenue as string,
        a.mode as SaleMode,
        a.sales_tax_rate as string,
        a.setup_fee_rate as string,
      )
      return {
        gross_revenue: r.grossRevenue.toString(),
        setup_fee: r.setupFee.toString(),
        sales_tax: r.salesTax.toString(),
        net_revenue: r.netRevenue.toString(),
      }
    }
    case 'calculate_financial_result': {
      const r = calculateFinancialResult(
        a.total_cost as string,
        a.net_revenue as string,
        a.produced_quantity as number,
      )
      return {
        profit: r.profit.toString(),
        profit_per_unit: r.profitPerUnit.toString(),
        roi: r.roi === null ? null : r.roi.toString(),
      }
    }
    default:
      throw new Error(`fn desconhecida: ${fn}`)
  }
}

test('os vetores dourados de craft passam idênticos ao motor Python', () => {
  expect(golden.vectors.length).toBeGreaterThan(20)
  for (const vector of golden.vectors) {
    expect(
      run(vector.fn, vector.args as Record<string, string | number | boolean>),
      `${vector.fn} ${JSON.stringify(vector.args)}`,
    ).toEqual(vector.expected)
  }
})
