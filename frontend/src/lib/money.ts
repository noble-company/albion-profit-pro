import Decimal from 'decimal.js'

/**
 * Aritmética de dinheiro no frontend (task 3.5/18, F09).
 *
 * A regra da Fase 3 é: dinheiro viaja como string decimal; o cliente **não** converte para
 * `number` nem faz aritmética monetária em ponto flutuante. Somas de prata passam de
 * `Number.MAX_SAFE_INTEGER` com folga (valores de dezenas de milhões são rotina no jogo), e a
 * task 23 vai mover o "e se" para cá — fazer isso sobre `number` viraria um problema de
 * exibição num problema de resultado errado.
 *
 * Escolha: `decimal.js`. Não `number`/`BigInt` — o ROI é `lucro / custo`, divisão com 4
 * casas, que BigInt não faz limpo. `Decimal.ROUND_CEIL`/`ROUND_FLOOR` batem 1:1 com
 * `ROUND_CEILING`/`ROUND_FLOOR` do Python, que é o que permite reproduzir o arredondamento
 * por-cobrança de `craft/formulas.py`.
 */

// Espelha o contexto `decimal` padrão do Python (prec=28, ROUND_HALF_EVEN) — é sob ele que
// `backend/src/craft/formulas.py` roda ao gerar os vetores dourados, então a divisão do ROI
// (`lucro / custo`) tem que arredondar exatamente igual. 28 dígitos cobrem silver de
// dezenas de bilhões com folga; somas abaixo disso são exatas nos dois lados.
// `toExpNeg/toExpPos` no extremo: `.toString()` nunca usa notação exponencial, igual ao
// `format(x, 'f')` do Python — os vetores dourados comparam string a string.
Decimal.set({
  precision: 28,
  rounding: Decimal.ROUND_HALF_EVEN,
  toExpNeg: -9e15,
  toExpPos: 9e15,
})

export type MoneyInput = string | number | Decimal
export type Money = Decimal

export function money(value: MoneyInput): Money {
  return value instanceof Decimal ? value : new Decimal(value)
}

export function add(...values: MoneyInput[]): Money {
  return values.reduce<Decimal>(
    (sum, value) => sum.plus(money(value)),
    new Decimal(0),
  )
}

export function subtract(a: MoneyInput, b: MoneyInput): Money {
  return money(a).minus(money(b))
}

/**
 * Divisão monetária — a fronteira única para `a / b` (ROI = `lucro / custo`, custo por
 * unidade, e a conversão do percentual de retorno digitado em taxa). `decimal.js` divide sob
 * o mesmo contexto (prec 28, `ROUND_HALF_EVEN`) que o `Decimal` do Python, então o quociente
 * arredonda igual dos dois lados — o que os vetores dourados comparam string a string.
 *
 * Não protege contra `b == 0` (devolve `Infinity`, como o `.div()` solto já fazia); quem
 * calcula ROI checa `isZero` antes.
 */
export function divide(a: MoneyInput, b: MoneyInput): Money {
  return money(a).div(money(b))
}

/** Multiplica por uma quantidade inteira não-negativa (unidades produzidas/compradas). */
/**
 * Converte o percentual que o usuário digita (ex.: `36,7`) na taxa em [0,1] que o engine
 * consome.
 *
 * Divisão decimal e não `Number(v) / 100` (task 3.6/01, `E01`): `36.7 / 100` dá
 * `0.367000000000005` em ponto flutuante, e o lixo se propagava até `profit`/`roi`, quebrando
 * o contrato que `F09` e os vetores dourados existem para garantir.
 *
 * Morava em `opportunities/production-params.ts`, que saiu com o ranking materializado
 * (task 4/15). O scanner é quem usa, e a conta é de dinheiro — o lugar dela é aqui.
 */
export function percentageToRate(value: string): string {
  if (!value) return '0'
  const normalized = value.replace(',', '.')
  try {
    return divide(normalized, 100).toString()
  } catch {
    return '0'
  }
}

export function multiplyByQuantity(value: MoneyInput, quantity: number): Money {
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new RangeError('quantity deve ser inteiro não-negativo')
  }
  return money(value).times(quantity)
}

/**
 * `ceil(base × taxa)` — uma cobrança percentual em silver, arredondada para cima
 * isoladamente. Idêntico a `calculate_percentage_charge` do Python (imposto e setup nunca
 * são somados antes de arredondar).
 */
export function percentageCharge(base: MoneyInput, rate: MoneyInput): Money {
  const b = money(base)
  const r = money(rate)
  if (b.isNegative()) throw new RangeError('base deve ser não-negativa')
  if (r.lessThan(0) || r.greaterThan(1)) {
    throw new RangeError('taxa deve estar entre 0 e 1')
  }
  return b.times(r).toDecimalPlaces(0, Decimal.ROUND_CEIL)
}

/** Arredonda uma Decimal não-negativa para cima até a unidade inteira (comprável). */
export function ceilToInteger(value: MoneyInput): Money {
  const v = money(value)
  if (v.isNegative()) throw new RangeError('valor deve ser não-negativo')
  return v.toDecimalPlaces(0, Decimal.ROUND_CEIL)
}

export function compare(a: MoneyInput, b: MoneyInput): -1 | 0 | 1 {
  return money(a).comparedTo(money(b)) as -1 | 0 | 1
}

export function isPositive(value: MoneyInput): boolean {
  return money(value).greaterThan(0)
}

export function isZero(value: MoneyInput): boolean {
  return money(value).isZero()
}

/**
 * Trunca para baixo (`ROUND_FLOOR`, na direção de -∞) para apresentação. Este valor **nunca**
 * volta para uma fórmula nem decide um limite de ROI (`docs/11-formulas-de-craft.md`).
 */
export function roundDownForDisplay(
  value: MoneyInput,
  decimalPlaces = 1,
): Money {
  return money(value).toDecimalPlaces(decimalPlaces, Decimal.ROUND_FLOOR)
}

export function formatSilver(value: MoneyInput | null | undefined): string {
  if (value == null || value === '') return '—'
  let parsed: Decimal
  try {
    parsed = money(value)
  } catch {
    return '—'
  }
  if (!parsed.isFinite()) return '—'
  const whole = parsed.toDecimalPlaces(0, Decimal.ROUND_FLOOR)
  const sign = whole.isNegative() ? '-' : ''
  const digits = whole.abs().toFixed(0)
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${sign}${grouped} silver`
}

/**
 * Formata uma quantidade (inteira ou fracionária, ex.: retorno esperado `0.7`) em pt-BR.
 * Decimal, não `Number()` — o backend manda a quantidade como string e casas perdidas por
 * ponto-flutuante mentem sobre o retorno (F09, task 3.5/22 item 3). Sem casas decimais
 * desnecessárias: `2` e não `2,0`.
 */
export function formatQuantity(
  value: MoneyInput | null | undefined,
  maxDecimals = 1,
): string {
  if (value == null || value === '') return '—'
  let parsed: Decimal
  try {
    parsed = money(value)
  } catch {
    return '—'
  }
  if (!parsed.isFinite()) return '—'
  const rounded = parsed.toDecimalPlaces(maxDecimals, Decimal.ROUND_HALF_EVEN)
  const parts = rounded.abs().toFixed(maxDecimals).split('.')
  const groupedWhole = (parts[0] ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const trimmedFraction = (parts[1] ?? '').replace(/0+$/, '')
  const sign = rounded.isNegative() ? '-' : ''
  return trimmedFraction
    ? `${sign}${groupedWhole},${trimmedFraction}`
    : `${sign}${groupedWhole}`
}

/** Formata uma porcentagem (já multiplicada por 100 pelo backend) em pt-BR, 1 casa, floor. */
export function formatPercent(value: MoneyInput | null | undefined): string {
  if (value == null || value === '') return '—'
  let parsed: Decimal
  try {
    parsed = money(value)
  } catch {
    return '—'
  }
  if (!parsed.isFinite()) return '—'
  return `${roundDownForDisplay(parsed, 1).toFixed(1).replace('.', ',')}%`
}
