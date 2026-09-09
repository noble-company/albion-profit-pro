import Decimal from 'decimal.js'

/**
 * Taxas do jogo — espelho de `backend/src/craft/constants.py`.
 *
 * Estavam privadas em `ranking-projection.ts:22-24`; o engine do scanner (task 4/05) precisa
 * das mesmas, e uma terceira cópia acabaria divergindo em silêncio no dia em que o jogo mudar
 * uma alíquota. Os vetores dourados travam os dois lados contra o Python.
 */

/** Imposto de venda com conta premium. */
export const PREMIUM_SALES_TAX_RATE = new Decimal('0.04')

/** Imposto de venda sem premium — o dobro. */
export const NON_PREMIUM_SALES_TAX_RATE = new Decimal('0.08')

/** Taxa de montagem, cobrada ao **postar** uma ordem (de compra ou de venda). */
export const SETUP_FEE_RATE = new Decimal('0.025')

export function salesTaxRateFor(premium: boolean): Decimal {
  return premium ? PREMIUM_SALES_TAX_RATE : NON_PREMIUM_SALES_TAX_RATE
}
