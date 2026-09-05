import { act, renderHook, waitFor } from '@testing-library/react'
import { delay, http, HttpResponse } from 'msw'
import { afterEach, expect, test, vi } from 'vitest'

import { useFlipOpportunities } from '@/opportunities/hooks'
import type { OpportunityQuery } from '@/opportunities/service'
import { useLocations } from '@/prices/hooks'
import { useDemand } from '@/prices/demand'
import { server } from '@/test/msw/server'

import {
  createTestQueryClient,
  wrapperWithQueryClient,
} from './queryTestClient'

// F04 / task 3.5/15: cada bullet de "Testes automatizados" da task vira um teste aqui —
// dedup, keepPreviousData, pausa de polling com a aba oculta, cancelamento no unmount e
// erro que limpa no sucesso seguinte. Cada QueryClient é isolado (retry:false) pra não
// depender do backoff real do cliente de produção.

const BASE_QUERY: OpportunityQuery = { limit: 25, offset: 0 }

afterEach(() => {
  Object.defineProperty(document, 'visibilityState', {
    value: 'visible',
    configurable: true,
  })
})

test('duas telas que pedem /locations disparam uma única requisição', async () => {
  let requests = 0
  server.use(
    http.get('http://localhost:8000/locations', () => {
      requests += 1
      return HttpResponse.json([
        {
          location_id: '1002',
          name: 'Lymhurst',
          display_name: 'Lymhurst',
          kind: 'city',
          is_royal_city: true,
        },
      ])
    }),
  )
  const client = createTestQueryClient()
  const wrapper = wrapperWithQueryClient(client)
  const first = renderHook(() => useLocations(), { wrapper })
  const second = renderHook(() => useLocations(), { wrapper })

  await waitFor(() => {
    expect(first.result.current).toHaveLength(1)
    expect(second.result.current).toHaveLength(1)
  })
  expect(requests).toBe(1)
})

test('mudar filtro mantém as linhas anteriores visíveis até a nova resposta chegar', async () => {
  server.use(
    http.get(
      'http://localhost:8000/opportunities/flips',
      async ({ request }) => {
        const url = new URL(request.url)
        const label = url.searchParams.get('item_id') ? 'filtrado' : 'inicial'
        await delay(20)
        return HttpResponse.json({
          server: 'west',
          kind: 'flip',
          opportunities: [{ item: label, quantity: 1 }],
          total: 1,
          limit: 25,
          offset: 0,
        })
      },
    ),
  )
  const client = createTestQueryClient()
  const { result, rerender } = renderHook(
    ({ query }: { query: OpportunityQuery }) =>
      useFlipOpportunities('west', query),
    {
      wrapper: wrapperWithQueryClient(client),
      initialProps: { query: BASE_QUERY },
    },
  )

  await waitFor(() =>
    expect(result.current.data?.opportunities?.[0]?.item).toBe('inicial'),
  )

  rerender({ query: { ...BASE_QUERY, item: 'T4_CLOTH' } })
  // Sem keepPreviousData isso já seria null aqui — a resposta nova ainda não chegou.
  expect(result.current.data?.opportunities?.[0]?.item).toBe('inicial')

  await waitFor(() =>
    expect(result.current.data?.opportunities?.[0]?.item).toBe('filtrado'),
  )
})

test('com a aba oculta, nenhum refetch periódico acontece', async () => {
  vi.useFakeTimers()
  try {
    let requests = 0
    server.use(
      http.get('http://localhost:8000/opportunities/flips', () => {
        requests += 1
        return HttpResponse.json({
          server: 'west',
          kind: 'flip',
          opportunities: [],
          total: 0,
          limit: 25,
          offset: 0,
        })
      }),
    )
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    })
    const client = createTestQueryClient()
    renderHook(() => useFlipOpportunities('west', BASE_QUERY), {
      wrapper: wrapperWithQueryClient(client),
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(requests).toBe(1) // a busca inicial sempre acontece

    await act(async () => {
      await vi.advanceTimersByTimeAsync(90_000) // 3x o refetchInterval de 30s
    })
    expect(requests).toBe(1) // refetchIntervalInBackground:false + aba oculta = sem poll
  } finally {
    vi.useRealTimers()
  }
})

test('desmontar o componente aborta a requisição em andamento', async () => {
  let resolveStarted: () => void
  const started = new Promise<void>((resolve) => {
    resolveStarted = resolve
  })
  let abortedWhenObserved = false
  server.use(
    http.get('http://localhost:8000/locations', async ({ request }) => {
      resolveStarted() // só desmonta depois que a requisição de fato saiu
      await delay(50)
      abortedWhenObserved = request.signal.aborted
      return HttpResponse.json([])
    }),
  )
  const client = createTestQueryClient()
  const { unmount } = renderHook(() => useLocations(), {
    wrapper: wrapperWithQueryClient(client),
  })
  await started
  unmount()
  await new Promise((resolve) => setTimeout(resolve, 80))
  expect(abortedWhenObserved).toBe(true)
})

test('um erro seguido de sucesso limpa o estado de erro', async () => {
  server.use(
    http.get(
      'http://localhost:8000/items/:item/demand',
      () => new HttpResponse(null, { status: 422 }),
      { once: true },
    ),
  )
  const client = createTestQueryClient()
  const { result, rerender } = renderHook(
    ({ quality }: { quality: number }) =>
      useDemand('T4_CLOTH', 'west', '1002', quality, 0),
    { wrapper: wrapperWithQueryClient(client), initialProps: { quality: 1 } },
  )

  await waitFor(() => expect(result.current.error).toBeTruthy())

  server.use(
    http.get('http://localhost:8000/items/:item/demand', () =>
      HttpResponse.json({
        book: {
          sell: { observed_units: 0, best_price: null },
          buy: { observed_units: 0, best_price: null },
        },
        sold: {
          last_24h: { units: 0, average_price: null },
          last_7d: { units: 0, average_price: null },
          last_30d: { units: 0, average_price: null },
        },
        series_6h: [],
      }),
    ),
  )
  // Nova chave de query (qualidade mudou) — dispara uma busca nova, que agora tem sucesso.
  rerender({ quality: 2 })

  await waitFor(() => expect(result.current.data).not.toBeNull())
  expect(result.current.error).toBeNull()
})
