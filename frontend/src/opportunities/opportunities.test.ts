import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import { server } from '@/test/msw/server'
import { getFlipOpportunities } from './service'

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
      buyLocations: ['1002', '3005'],
      sellLocations: ['3005', '4002'],
      tiers: [4, 5],
      enchantments: [1, 2],
      qualities: [3, 4],
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
  expect(requested).toContain('buy_location_id=1002')
  expect(requested).toContain('buy_location_id=3005')
  expect(requested).toContain('sell_location_id=3005')
  expect(requested).toContain('sell_location_id=4002')
  expect(requested).toContain('tier=4')
  expect(requested).toContain('tier=5')
  expect(requested).toContain('enchantment_level=1')
  expect(requested).toContain('enchantment_level=2')
  expect(requested).toContain('quality_level=3')
  expect(requested).toContain('quality_level=4')
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
