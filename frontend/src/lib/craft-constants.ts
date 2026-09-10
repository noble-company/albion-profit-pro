import Decimal from 'decimal.js'

/**
 * Taxas do jogo — espelho de `backend/src/craft/constants.py`.
 *
 * Estavam privadas na camada de projeção do ranking (apagada na task 4/15); o engine do
 * scanner precisa das mesmas, e uma terceira cópia divergiria em silêncio no dia em que o jogo
 * uma alíquota. Os vetores dourados travam os dois lados contra o Python.
 */

/** Imposto de venda com conta premium. */
export const PREMIUM_SALES_TAX_RATE = new Decimal('0.04')

/** Imposto de venda sem premium — o dobro. */
export const NON_PREMIUM_SALES_TAX_RATE = new Decimal('0.08')

/** Taxa de montagem, cobrada ao **postar** uma ordem (de compra ou de venda). */
export const SETUP_FEE_RATE = new Decimal('0.025')

/**
 * Nutrição consumida por execução = valor do item × este fator, e a estação cobra uma taxa
 * **por 100 de nutrição** (task 4/18). Verificado contra a estação no jogo: Couro T4.2
 * (`@itemvalue` 64) a 390 por 100 de nutrição dá 28,08, e o jogo cobra 28.
 */
export const NUTRITION_PER_ITEM_VALUE = new Decimal('0.1125')

/** A taxa é cotada por 100 de nutrição, não por 1. */
export const NUTRITION_FEE_BASIS = new Decimal('100')

export function salesTaxRateFor(premium: boolean): Decimal {
  return premium ? PREMIUM_SALES_TAX_RATE : NON_PREMIUM_SALES_TAX_RATE
}
