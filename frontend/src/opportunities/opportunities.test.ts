import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import { server } from '@/test/msw/server'
import { getFlipOpportunities, getProductionOpportunities } from './service'

test('Market Flip envia filtros e paginação na URL compartilhável', async () => {
  let requested = ''
  server.use(
    http.get('http://localhost:8000/opportunities/flips', ({ request }) => {
      requested = request.url
      return HttpResponse.json({
        server: 'west',
        kind: 'flip',
        opportunities: [],
        total: 0,
        limit: 25,
        offset: 50,
      })
    }),
  )
  await getFlipOpportunities(
    'west',
    {
      item: 'T4_CLOTH',
      locations: ['1002', '3005'],
      tier: 4,
      enchantment: 1,
      quality: 3,
      maxAgeHours: 2,
      requireComplete: true,
      limit: 25,
      offset: 50,
      minProfit: '1000',
      minRoi: '10',
      profitOnly: true,
      premium: false,
      buyOrder: true,
      sellOrder: true,
      sort: 'roi',
      direction: 'asc',
    },
    new AbortController().signal,
  )
  expect(requested).toContain('server=west')
  expect(requested).toContain('item_id=T4_CLOTH')
  expect(requested).toContain('location_id=1002')
  expect(requested).toContain('location_id=3005')
  expect(requested).toContain('quality_level=3')
  expect(requested).toContain('require_complete=true')
  expect(requested).toContain('min_profit=1000')
  expect(requested).toContain('premium=false')
  expect(requested).toContain('buy_order=true')
  expect(requested).toContain('sell_order=true')
  expect(requested).toContain('offset=50')
  // A ordenação vai pro servidor, sobre o conjunto completo (F08).
  expect(requested).toContain('sort=roi')
  expect(requested).toContain('direction=asc')
})

test('ranking de produção envia filtros de universo, mas NÃO os controles "e se" (task 23)', async () => {
  let requested = ''
  server.use(
    http.get('http://localhost:8000/opportunities/refining', ({ request }) => {
      requested = request.url
      return HttpResponse.json({
        server: 'west',
        kind: 'refining',
        opportunities: [],
        total: 0,
        limit: 25,
        offset: 0,
      })
    }),
  )

  await getProductionOpportunities(
    'refining',
    'west',
    {
      locations: ['1002'],
      tier: 5,
      enchantment: 2,
      quality: 3,
      maxAgeHours: 2,
      requireComplete: true,
      limit: 25,
      offset: 0,
      minProfit: '500',
      minRoi: '12.5',
      profitOnly: true,
      returnRate: '0.365',
      stationCostPerExecution: '450',
      useFocus: true,
      premium: false,
    },
    new AbortController().signal,
  )

  expect(requested).toContain('location_id=1002')
  expect(requested).toContain('tier=5')
  expect(requested).toContain('enchantment_level=2')
  expect(requested).toContain('quality_level=3')
  expect(requested).toContain('max_age_hours=2')
  expect(requested).toContain('require_complete=true')
  expect(requested).toContain('min_profit=500')
  expect(requested).toContain('min_roi=12.5')
  // premium/retorno/estação/foco são projeção no cliente (task 23) — não vão ao servidor.
  expect(requested).not.toContain('return_rate')
  expect(requested).not.toContain('station_cost_per_execution')
  expect(requested).not.toContain('use_focus')
  expect(requested).not.toContain('premium')
})
