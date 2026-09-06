import { expect, test } from 'vitest'

import {
  calculateAcquisitionCost,
  calculateFinancialResult,
  calculateFocusConsumed,
  calculateIngredientRequirement,
  calculateProduction,
  calculateSaleRevenue,
} from './craft-formulas'

// task 3.5/26: os vetores dourados (craft-formulas.golden.test.ts) travam os caminhos
// felizes contra o Python. Aqui ficam as guardas de domínio — cada `RangeError` do contrato
// de `docs/11-formulas-de-craft.md`. Elas nunca podem virar "retorna NaN em silêncio".

test('calculateProduction rejeita quantidades não-positivas', () => {
  expect(() => calculateProduction(0, 4)).toThrow(RangeError)
  expect(() => calculateProduction(-1, 4)).toThrow(RangeError)
  expect(() => calculateProduction(10, 0)).toThrow(RangeError)
})

test('calculateIngredientRequirement rejeita contagem/execuções negativas e taxa fora de [0,1]', () => {
  expect(() => calculateIngredientRequirement(-1, 4, '0')).toThrow(RangeError)
  expect(() => calculateIngredientRequirement(2, -1, '0')).toThrow(RangeError)
  expect(() => calculateIngredientRequirement(2, 4, '1.5')).toThrow(RangeError)
  expect(() => calculateIngredientRequirement(2, 4, '-0.1')).toThrow(RangeError)
})

test('calculateFocusConsumed rejeita foco/execuções negativos', () => {
  expect(() => calculateFocusConsumed(-1, 4, true)).toThrow(RangeError)
  expect(() => calculateFocusConsumed(180, -1, true)).toThrow(RangeError)
})

test('calculateAcquisitionCost rejeita custo negativo e taxa fora de [0,1]', () => {
  expect(() =>
    calculateAcquisitionCost('-1', 'buy_order', '0.025'),
  ).toThrow(RangeError)
  expect(() =>
    calculateAcquisitionCost('100', 'buy_order', '2'),
  ).toThrow(RangeError)
})

test('calculateSaleRevenue rejeita bruto negativo e taxas fora de [0,1]', () => {
  expect(() =>
    calculateSaleRevenue('-1', 'sell_order', '0.04', '0.025'),
  ).toThrow(RangeError)
  expect(() =>
    calculateSaleRevenue('100', 'sell_order', '1.1', '0.025'),
  ).toThrow(RangeError)
  expect(() =>
    calculateSaleRevenue('100', 'sell_order', '0.04', '9'),
  ).toThrow(RangeError)
})

test('calculateFinancialResult rejeita custo negativo e quantidade não-positiva', () => {
  expect(() => calculateFinancialResult('-1', '100', 4)).toThrow(RangeError)
  expect(() => calculateFinancialResult('100', '100', 0)).toThrow(RangeError)
  expect(() => calculateFinancialResult('100', '100', -2)).toThrow(RangeError)
})

test('calculateFinancialResult devolve roi null quando o custo é zero', () => {
  const r = calculateFinancialResult('0', '100', 4)
  expect(r.roi).toBeNull()
  expect(r.profit.toString()).toBe('100')
})
