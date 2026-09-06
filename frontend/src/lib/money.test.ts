import { describe, expect, test } from 'vitest'

import {
  add,
  compare,
  formatPercent,
  formatQuantity,
  formatSilver,
  isPositive,
  isZero,
  money,
  multiplyByQuantity,
  percentageCharge,
  roundDownForDisplay,
  subtract,
} from './money'

describe('money — aritmética exata de prata (F09)', () => {
  test('soma acima de Number.MAX_SAFE_INTEGER continua exata', () => {
    const big = '9007199254740993' // MAX_SAFE_INTEGER + 2
    // Como number isso já erra: 9007199254740993 + 2 === 9007199254740996 (perde o 1).
    expect(add(big, '2').toString()).toBe('9007199254740995')
    const huge = add('12345678901234567890', '98765432109876543210')
    expect(huge.toString()).toBe('111111111011111111100')
  })

  test('subtração e comparação sem ponto flutuante', () => {
    expect(subtract('0.3', '0.1').toString()).toBe('0.2') // number daria 0.199999...
    expect(compare('0.3', subtract('0.4', '0.1'))).toBe(0)
  })

  test('multiplicação por quantidade inteira', () => {
    expect(multiplyByQuantity('1240', 6).toString()).toBe('7440')
    expect(() => multiplyByQuantity('10', 1.5)).toThrow()
    expect(() => multiplyByQuantity('10', -1)).toThrow()
  })

  test('percentageCharge arredonda cada cobrança para cima, isoladamente', () => {
    // ceil(1501 * 0.04) = ceil(60.04) = 61 — não 60.
    expect(percentageCharge('1501', '0.04').toString()).toBe('61')
    // imposto e setup nunca somam antes do teto:
    const tax = percentageCharge('1500', '0.04') // 60
    const setup = percentageCharge('1500', '0.025') // ceil(37.5) = 38
    expect(tax.toString()).toBe('60')
    expect(setup.toString()).toBe('38')
    expect(add(tax, setup).toString()).toBe('98')
    // se somasse 1500*(0.065)=97.5 e desse teto, seria 98 por coincidência; troque a base:
    expect(percentageCharge('101', '0.04').toString()).toBe('5') // ceil(4.04)
    expect(percentageCharge('101', '0.025').toString()).toBe('3') // ceil(2.525)
  })

  test('rejeita taxa fora de [0, 1] e base negativa', () => {
    expect(() => percentageCharge('100', '1.5')).toThrow()
    expect(() => percentageCharge('-1', '0.04')).toThrow()
  })

  test('roundDownForDisplay trunca para -∞, nunca para zero', () => {
    expect(roundDownForDisplay('2.525').toString()).toBe('2.5')
    expect(roundDownForDisplay('-2.525').toString()).toBe('-2.6')
  })

  test('predicados', () => {
    expect(isPositive('0.0001')).toBe(true)
    expect(isPositive('0')).toBe(false)
    expect(isZero('0.00')).toBe(true)
  })
})

describe('formatação', () => {
  test('formatSilver agrupa milhares sem perder inteiros gigantes', () => {
    expect(formatSilver('12345678901234567890.55')).toBe(
      '12.345.678.901.234.567.890 silver',
    )
    expect(formatSilver('0')).toBe('0 silver')
    expect(formatSilver(null)).toBe('—')
    expect(formatSilver('-1500')).toBe('-1.500 silver')
  })

  test('formatPercent em pt-BR, 1 casa, para baixo', () => {
    expect(formatPercent('10.5')).toBe('10,5%')
    expect(formatPercent('18.4999')).toBe('18,4%') // floor, não arredonda pra cima
    expect(formatPercent(money('0'))).toBe('0,0%')
    expect(formatPercent(null)).toBe('—')
  })

  test('formatQuantity — decimal, sem casas desnecessárias', () => {
    expect(formatQuantity('2')).toBe('2')
    expect(formatQuantity('2.0')).toBe('2')
    expect(formatQuantity('0.7')).toBe('0,7')
    expect(formatQuantity('0.72')).toBe('0,7') // 1 casa por padrão
    expect(formatQuantity('1234.5')).toBe('1.234,5')
    expect(formatQuantity('-3.5')).toBe('-3,5')
    expect(formatQuantity(null)).toBe('—')
    expect(formatQuantity('')).toBe('—')
  })
})
