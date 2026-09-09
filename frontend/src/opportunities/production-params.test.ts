import { describe, expect, test } from 'vitest'

import { percentageToRate } from './production-params'

// Task 3.6/01 (E01): o percentual de retorno digitado tem que virar taxa com divisão decimal,
// não `Number(v) / 100`. `36.7 / 100 === 0.36700000000000005` em ponto flutuante e esse lixo
// se propagava até profit/roi, divergindo do motor Python (`Decimal('36.7') / 100`).
describe('percentageToRate — divisão decimal na entrada do usuário', () => {
  test('percentual com fração não vira número de ponto flutuante', () => {
    expect(percentageToRate('36.7')).toBe('0.367')
    expect(percentageToRate('8.8')).toBe('0.088')
    expect(percentageToRate('2.9')).toBe('0.029')
    expect(percentageToRate('1.1')).toBe('0.011')
  })

  test('vírgula decimal produz o mesmo que ponto', () => {
    expect(percentageToRate('36,7')).toBe(percentageToRate('36.7'))
    expect(percentageToRate('8,8')).toBe('0.088')
  })

  test('inteiros e zero', () => {
    expect(percentageToRate('50')).toBe('0.5')
    expect(percentageToRate('0')).toBe('0')
    expect(percentageToRate('100')).toBe('1')
  })

  test('entrada vazia ou não numérica cai para "0"', () => {
    expect(percentageToRate('')).toBe('0')
    expect(percentageToRate('abc')).toBe('0')
    expect(percentageToRate('1,5,5')).toBe('0')
  })
})
