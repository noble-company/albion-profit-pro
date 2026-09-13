import Decimal from 'decimal.js'

import { roundDownForDisplay } from '@/lib/craft-formulas'
import { divide, formatQuantity, money, type MoneyInput } from '@/lib/money'

/**
 * As taxas de retorno de recurso que o jogo pratica (task 4/11.4).
 *
 * Ninguém decora `15,2` e `36,7`. Mas eles não são números soltos: saem de **uma fórmula só**,
 * documentada pela Sandbox —
 *
 *     retorno = 1 − 1 / (1 + bônus de produção)
 *
 * onde o bônus é o **Local Production Bonus** da estação, mais `0,59` fixo se o craft usar foco.
 * Por isso os atalhos aqui são **derivados**, não digitados: um dígito trocado numa constante
 * de bônus quebra o teste, enquanto quatro percentuais escritos à mão passariam despercebidos.
 *
 * | | sem foco | com foco |
 * |---|---|---|
 * | Estação sem bônus de cidade (LPB 18%) | 15,2% | 43,5% |
 * | Cidade com bônus para o recurso (LPB 58%) | 36,7% | 53,9% |
 *
 * O `36,7%` é o único que temos **medido no próprio jogo**: 10× T2_FIBER refinados devolveram
 * 4 algodões (`docs/03-contrato-ingest-real.md`).
 *
 * Ilha e hideout sem bônus de produção ficam em 0% — é o campo vazio, não um atalho.
 */

/** Foco soma 0,59 ao bônus de produção, seja qual for a estação. */
const BONUS_DO_FOCO = new Decimal('0.59')

/** Estação em cidade real, recurso **sem** bônus daquela cidade. */
const LPB_PADRAO = new Decimal('0.18')

/** Cidade que dá bônus para aquele recurso (18% base + 40% do bônus). */
const LPB_COM_BONUS = new Decimal('0.58')

/**
 * `1 − 1/(1 + bônus)`, em percentual, **truncado** em uma casa — é assim que o jogo mostra.
 * Arredondar para cima faria o atalho anunciar `15,3%`, que não existe em tela nenhuma.
 */
export function returnRatePercent(lpb: Decimal, comFoco: boolean): string {
  const bonus = comFoco ? lpb.plus(BONUS_DO_FOCO) : lpb
  const taxa = new Decimal(1).minus(new Decimal(1).div(bonus.plus(1)))
  return roundDownForDisplay(taxa.times(100), 1).toString()
}

export interface RetornoPadrao {
  /** o percentual como o jogo exibe, ex.: `'36.7'` */
  percent: string
  descricao: string
}

export const RETORNOS_PADRAO: RetornoPadrao[] = [
  { percent: returnRatePercent(LPB_PADRAO, false), descricao: 'Cidade sem bônus, sem foco' },
  { percent: returnRatePercent(LPB_COM_BONUS, false), descricao: 'Cidade com bônus, sem foco' },
  { percent: returnRatePercent(LPB_PADRAO, true), descricao: 'Cidade sem bônus, com foco' },
  { percent: returnRatePercent(LPB_COM_BONUS, true), descricao: 'Cidade com bônus, com foco' },
]

/**
 * Quantos itens saem de 100 recursos comprados, com a taxa dada: `100 / (1 − taxa)`, a soma da
 * série de refinos sucessivos.
 *
 * Devolve `null` fora do intervalo útil. **Taxa 1 (100%) dividiria por zero** — e `decimal.js`
 * lança nessa divisão, o que derrubaria a tela inteira por causa de um número digitado num
 * campo de filtro.
 */
export function rendimentoPorCemRecursos(taxa: MoneyInput): string | null {
  const valor = money(taxa)
  if (!valor.greaterThan(0) || valor.greaterThanOrEqualTo(1)) return null
  return formatQuantity(divide(100, new Decimal(1).minus(valor)), 0)
}
