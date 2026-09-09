import { expect, test } from 'vitest'

import {
  calculateAcquisitionCost,
  calculateFinancialResult,
  calculateFocusConsumed,
  calculateIngredientRequirement,
  calculateProduction,
  calculateSaleRevenue,
  calculateStationFee,
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

// task 4/18 — a estação cobra por nutrição consumida, não por execução.

test('calculateStationFee bate com o número que o jogo cobra', () => {
  // Estação aberta no jogo: taxa de uso 390 por 100 de nutrição, refinando Couro T4.2
  // (`@itemvalue` 64). O jogo cobrou 28; a tela mostrava 400.
  expect(calculateStationFee('64', '390', 1).toString()).toBe('28.08')
})

test('calculateStationFee escala com as execuções', () => {
  expect(calculateStationFee('64', '390', 100).toString()).toBe('2808')
})

test('o valor do item manda no tamanho da taxa — por isso prata fixa não servia', () => {
  // O erro do modelo antigo trocava de sinal: uma taxa fixa de 400 cobrava 56× demais num
  // recurso T4 e 9× de menos numa arma T8.
  const couroT4 = calculateStationFee('16', '400', 1)
  const machadoT8 = calculateStationFee('8192', '400', 1)

  expect(couroT4.toString()).toBe('7.2')
  expect(machadoT8.toString()).toBe('3686.4')
  expect(couroT4.lessThan(400) && machadoT8.greaterThan(400)).toBe(true)
})

test('sem valor de item a estação não cobra, e não inventa', () => {
  // Trade pack de facção: os ingredientes são tokens sem valor em ponto nenhum da cadeia.
  expect(calculateStationFee(null, '390', 10).toString()).toBe('0')
})

test('calculateStationFee rejeita taxa negativa', () => {
  expect(() => calculateStationFee('64', '-1', 1)).toThrow(RangeError)
  expect(() => calculateStationFee('-64', '390', 1)).toThrow(RangeError)
})
