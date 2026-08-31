import { delay, http, HttpResponse } from 'msw'

import { apiClient, safeApiCall } from './client'
import { ApiError } from './errors'
import { queryClient } from './query'
import {
  resetUnauthorizedWave,
  setAccessToken,
  subscribeUnauthorized,
} from './session'
import { server } from '@/test/msw/server'

afterEach(() => {
  setAccessToken(null)
  resetUnauthorizedWave()
})

test('envia JWT e mantém query/path/body tipados pelo OpenAPI', async () => {
  setAccessToken('jwt-task-07')
  let receivedBody: unknown

  server.use(
    http.get('http://localhost:8000/items/search', ({ request }) => {
      expect(new URL(request.url).searchParams.get('q')).toBe('T4_SWORD')
      expect(new URL(request.url).searchParams.get('limit')).toBe('10')
      expect(request.headers.get('Authorization')).toBe('Bearer jwt-task-07')
      return HttpResponse.json([])
    }),
    http.post('http://localhost:8000/craft/simulate', async ({ request }) => {
      expect(request.headers.get('Authorization')).toBe('Bearer jwt-task-07')
      receivedBody = await request.json()
      return HttpResponse.json({})
    }),
  )

  await safeApiCall(() =>
    apiClient.GET('/items/search', {
      params: { query: { q: 'T4_SWORD', limit: 10 } },
    }),
  )
  await safeApiCall(() =>
    apiClient.POST('/craft/simulate', {
      body: {
        server: 'west',
        output_item: 'T2_CLOTH',
        quantity: 1,
        location_id: '1002',
        output_quality: 1,
        scope: 'all',
        return_rate: '0',
        station_cost_per_execution: '0',
        use_focus: false,
        premium: true,
      },
    }),
  )

  expect(receivedBody).toMatchObject({
    output_item: 'T2_CLOTH',
    location_id: '1002',
  })
})

test('normaliza HTTP, rede e cancelamento sem perder o detail', async () => {
  server.use(
    http.get('http://localhost:8000/health', () =>
      HttpResponse.json({ detail: 'rate limit' }, { status: 429 }),
    ),
  )
  await expect(
    safeApiCall(() => apiClient.GET('/health')),
  ).rejects.toMatchObject({
    kind: 'http',
    status: 429,
    detail: 'rate limit',
    retryable: true,
  })

  const controller = new AbortController()
  server.use(
    http.get('http://localhost:8000/health', async () => {
      await delay(100)
      return HttpResponse.json({ status: 'ok' })
    }),
  )
  const pending = safeApiCall(() =>
    apiClient.GET('/health', { signal: controller.signal }),
  )
  controller.abort()
  await expect(pending).rejects.toBeInstanceOf(ApiError)
  await expect(pending).rejects.toMatchObject({ kind: 'aborted' })
})

test('consolida várias respostas 401 na mesma onda', async () => {
  let notifications = 0
  const unsubscribe = subscribeUnauthorized(() => {
    notifications += 1
  })
  setAccessToken('expirado')
  server.use(
    http.get(
      'http://localhost:8000/auth/me',
      () => new HttpResponse(null, { status: 401 }),
    ),
  )

  await Promise.allSettled([
    safeApiCall(() => apiClient.GET('/auth/me')),
    safeApiCall(() => apiClient.GET('/auth/me')),
  ])

  expect(notifications).toBe(1)
  unsubscribe()
})

test('QueryClient só repete falhas transitórias e nunca mutations', () => {
  const retry = queryClient.getDefaultOptions().queries?.retry
  expect(typeof retry).toBe('function')
  expect(
    (retry as (failureCount: number, error: ApiError) => boolean)(
      0,
      new ApiError('x', { kind: 'http', status: 503 }),
    ),
  ).toBe(true)
  expect(
    (retry as (failureCount: number, error: ApiError) => boolean)(
      0,
      new ApiError('x', { kind: 'http', status: 422 }),
    ),
  ).toBe(false)
  expect(queryClient.getDefaultOptions().mutations?.retry).toBe(false)
})
