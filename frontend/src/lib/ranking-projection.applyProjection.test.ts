import { readFileSync } from 'node:fs'

import { expect, test } from 'vitest'

import type { components } from '@/api/schema'

import { money } from './money'
import {
  applyProjection,
  projectRankingRow,
  type ProjectionParams,
} from './ranking-projection'

// Task 3.5/26: os vetores dourados (ranking-projection.golden.test.ts) travam
// `projectRankingRow` string a string contra o Python. Este arquivo cobre a costura que
// falta: `applyProjection` — o ponto de integração real (production-pages.tsx o chama sobre
// cada linha da página). Ninguém verificava o mapeamento camelCase→snake_case, nem
// buy_price/sell_price (custo/faturamento ÷ produzido), nem o passthrough do flip.

type Opportunity = components['schemas']['OpportunityOut']
type RankingComponents = components['schemas']['RankingComponentsOut']

const golden = JSON.parse(
  readFileSync(
    '../backend/tests/fixtures/golden/projection-vectors.json',
    'utf8',
  ),
) as {
  vectors: Array<{
    components: Record<string, unknown>
    params: {
      premium: boolean
      return_rate: string
      station_cost_per_execution: string
      use_focus: boolean
    }
    expected: Record<string, unknown> | null
  }>
}

const sample = golden.vectors.find((v) => v.expected)!
const components = sample.components as unknown as RankingComponents
const params: ProjectionParams = {
  premium: sample.params.premium,
  returnRate: sample.params.return_rate,
  stationCostPerExecution: sample.params.station_cost_per_execution,
  useFocus: sample.params.use_focus,
}

function rankingRow(): Opportunity {
  return {
    kind: 'crafting',
    item: 'T4_BAG',
    item_name: 'Bolsa',
    quality_level: 1,
    quantity: 1,
    price_model: 'neutral_ranking',
    // valores "servidor" propositalmente errados — applyProjection tem de sobrescrever
    total_cost: '999',
    gross_revenue: '999',
    profit: '999',
    roi: '999',
    buy_price: '999',
    sell_price: '999',
    components,
  }
}

test('linha de flip (sem components) volta intacta', () => {
  const flip: Opportunity = {
    kind: 'flip',
    item: 'T4_CLOTH',
    quantity: 1,
    profit: '1234',
    total_cost: '5000',
  }
  expect(applyProjection(flip, params)).toBe(flip)
})

test('linha de ranking: campos financeiros recalculados a partir da projeção', () => {
  const projected = projectRankingRow(components, params)!
  const out = applyProjection(rankingRow(), params)

  expect(out.total_cost).toBe(projected.totalCost.toString())
  expect(out.gross_revenue).toBe(projected.grossRevenue.toString())
  expect(out.sales_tax).toBe(projected.salesTax.toString())
  expect(out.sale_setup_fee).toBe(projected.saleSetupFee.toString())
  expect(out.net_revenue).toBe(projected.netRevenue.toString())
  expect(out.acquisition_setup_fee).toBe(
    projected.acquisitionSetupFee.toString(),
  )
  expect(out.total_fees).toBe(projected.totalFees.toString())
  expect(out.profit).toBe(projected.profit.toString())
  expect(out.roi).toBe(projected.roi!.toString())
  expect(out.acquisition_mode).toBe(projected.acquisitionMode)
  expect(out.sale_mode).toBe(projected.saleMode)
  expect(out.station_cost).toBe(projected.stationCost.toString())
  expect(out.focus_consumed).toBe(projected.focusConsumed)
})

test('linha de ranking: buy_price e sell_price são por unidade produzida', () => {
  const produced = components.produced_quantity
  const projected = projectRankingRow(components, params)!
  const out = applyProjection(rankingRow(), params)

  expect(out.buy_price).toBe(projected.totalCost.div(produced).toString())
  expect(out.sell_price).toBe(projected.grossRevenue.div(produced).toString())
})

test('linha de ranking: identidade de reconciliação fecha', () => {
  const out = applyProjection(rankingRow(), params)
  // net = gross − sales_tax − sale_setup_fee ; profit = net − total_cost
  const net = money(out.gross_revenue!)
    .minus(out.sales_tax!)
    .minus(out.sale_setup_fee!)
  expect(net.toString()).toBe(money(out.net_revenue!).toString())
  expect(net.minus(out.total_cost!).toString()).toBe(
    money(out.profit!).toString(),
  )
})
