import { renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'

import { useLocationName, useMarketToggles } from '@/lib/locations'
import {
  createTestQueryClient,
  wrapperWithQueryClient,
} from '@/test/queryTestClient'
import { server } from '@/test/msw/server'

// F06 / task 3.5/19: todas as telas (Market Flip, Refino, Craft, Preços) leem o nome de uma
// cidade do mesmo hook, alimentado por `GET /locations`. Aqui trava-se o contrato desse hook:
// nome do banco, fallback honesto pro ID cru, e agrupamento de mercados vindo do dado.

const CATALOG = [
  {
    location_id: '1002',
    name: 'Lymhurst',
    display_name: 'Lymhurst',
    kind: 'city',
    is_royal_city: true,
  },
  {
    location_id: '1301',
    name: 'Lymhurst',
    display_name: 'Lymhurst',
    kind: 'city',
    is_royal_city: true,
  },
  {
    location_id: '3005',
    name: 'Caerleon',
    display_name: 'Caerleon',
    kind: 'city',
    is_royal_city: true,
  },
  {
    location_id: '3003',
    name: 'Black Market',
    display_name: 'Black Market',
    kind: 'city',
    is_royal_city: false,
  },
]

function mountLocations() {
  server.use(
    http.get('http://localhost:8000/locations', () =>
      HttpResponse.json(CATALOG),
    ),
  )
  return wrapperWithQueryClient(createTestQueryClient())
}

test('o nome vem do backend e é o mesmo para o mesmo ID em qualquer tela', async () => {
  const wrapper = mountLocations()
  const a = renderHook(() => useLocationName(), { wrapper })
  const b = renderHook(() => useLocationName(), { wrapper })

  await waitFor(() => {
    expect(a.result.current('3005')).toBe('Caerleon')
    expect(b.result.current('3005')).toBe('Caerleon')
  })
  expect(a.result.current('3003')).toBe('Black Market')
  expect(b.result.current('3003')).toBe('Black Market')
})

test('ID desconhecido exibe o próprio ID, nunca um nome inventado como "Mercado"', async () => {
  const wrapper = mountLocations()
  const { result } = renderHook(() => useLocationName(), { wrapper })

  await waitFor(() => expect(result.current('3005')).toBe('Caerleon'))
  expect(result.current('9999-Unknown')).toBe('9999-Unknown')
  expect(result.current('9999-Unknown')).not.toMatch(/mercado/i)
})

test('null/undefined viram um traço, não "null"', async () => {
  const wrapper = mountLocations()
  const { result } = renderHook(() => useLocationName(), { wrapper })

  await waitFor(() => expect(result.current('3005')).toBe('Caerleon'))
  expect(result.current(null)).toBe('—')
  expect(result.current(undefined)).toBe('—')
})

test('useMarketToggles agrupa Lymhurst (1002 + 1301) num toggle só, a partir do dado', async () => {
  const wrapper = mountLocations()
  const { result } = renderHook(() => useMarketToggles(), { wrapper })

  await waitFor(() => expect(result.current.length).toBeGreaterThan(0))
  const lymhurst = result.current.find((t) => t.name === 'Lymhurst')
  expect(lymhurst?.ids.sort()).toEqual(['1002', '1301'])
  expect(result.current.filter((t) => t.name === 'Lymhurst')).toHaveLength(1)
})
