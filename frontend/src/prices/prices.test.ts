import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import { server } from '@/test/msw/server'
import { getItemPrices } from './service'

test('preços sempre enviam servidor, escopo e local repetível', async () => {
  let url = ''
  server.use(
    http.get('http://localhost:8000/items/T4_CLOTH/prices', ({ request }) => {
      url = request.url
      return HttpResponse.json({
        server: 'west',
        item_id: 'T4_CLOTH',
        scope: 'all',
        prices: [],
        total: 0,
        limit: 20,
        offset: 0,
      })
    }),
  )
  await getItemPrices(
    'T4_CLOTH',
    'west',
    'all',
    ['1001', '1002'],
    20,
    0,
    new AbortController().signal,
  )
  expect(url).toContain('server=west')
  expect(url).toContain('location_id=1001')
  expect(url).toContain('location_id=1002')
})
