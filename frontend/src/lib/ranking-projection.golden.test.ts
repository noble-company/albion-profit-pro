import { readFileSync } from 'node:fs'

import { expect, test } from 'vitest'

import type { components } from '@/api/schema'

import { percentageToRate } from '@/opportunities/production-params'

import { projectRankingRow, type ProjectionParams } from './ranking-projection'

// Task 3.5/23: os vetores são gerados por `_project_row` do servidor
// (backend/scripts/generate_projection_vectors.py) e este teste roda o porte TS sobre eles.
// Se um dos dois lados mudar sem regerar, um dos testes quebra — a projeção do cliente não
// pode divergir da do servidor em silêncio.

type RankingComponents = components['schemas']['RankingComponentsOut']

type Vector = {
  components: Record<string, unknown>
  params: {
    premium: boolean
    /** taxa já normalizada em [0,1]; ausente quando o caso traz `return_rate_percent` */
    return_rate?: string
    /** percentual digitado pelo usuário (task 3.6/01, E01) — convertido por `percentageToRate` */
    return_rate_percent?: string
    station_cost_per_execution: string
    use_focus: boolean
  }
  expected: Record<string, unknown> | null
}

const golden = JSON.parse(
  readFileSync(
    '../backend/tests/fixtures/golden/projection-vectors.json',
    'utf8',
  ),
) as { vectors: Vector[]; rates: Record<string, string> }

function run(
  components: Record<string, unknown>,
  params: Vector['params'],
): Record<string, unknown> | null {
  const projectionParams: ProjectionParams = {
    premium: params.premium,
    // Quando o caso traz o percentual digitado, a conversão do cliente (`percentageToRate`)
    // faz parte do que o vetor trava — não só a projeção que vem depois.
    returnRate:
      params.return_rate_percent != null
        ? percentageToRate(params.return_rate_percent)
        : (params.return_rate ?? '0'),
    stationCostPerExecution: params.station_cost_per_execution,
    useFocus: params.use_focus,
  }
  const result = projectRankingRow(
    components as RankingComponents,
    projectionParams,
  )
  if (!result) return null
  return {
    acquisition_mode: result.acquisitionMode,
    sale_mode: result.saleMode,
    gross_revenue: result.grossRevenue.toString(),
    sales_tax: result.salesTax.toString(),
    sale_setup_fee: result.saleSetupFee.toString(),
    net_revenue: result.netRevenue.toString(),
    acquisition_setup_fee: result.acquisitionSetupFee.toString(),
    total_fees: result.totalFees.toString(),
    total_cost: result.totalCost.toString(),
    profit: result.profit.toString(),
    roi: result.roi === null ? null : result.roi.toString(),
    station_cost: result.stationCost.toString(),
    focus_consumed: result.focusConsumed,
    oldest_observed_at: result.oldestObservedAt,
  }
}

test('a projeção do cliente bate string a string com _project_row do servidor', () => {
  expect(golden.vectors.length).toBeGreaterThanOrEqual(6)
  for (const vector of golden.vectors) {
    expect(
      run(vector.components, vector.params),
      JSON.stringify(vector.params),
    ).toEqual(vector.expected)
  }
})

test('as taxas do fixture batem com as constantes do porte', () => {
  expect(golden.rates.premium_sales_tax).toBe('0.04')
  expect(golden.rates.non_premium_sales_tax).toBe('0.08')
  expect(golden.rates.setup_fee).toBe('0.025')
})
