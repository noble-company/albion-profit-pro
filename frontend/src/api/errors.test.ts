import { describe, expect, test } from 'vitest'

import {
  ApiError,
  errorFromResponse,
  isRetryableApiError,
  normalizeDetail,
  normalizeRequestError,
} from './errors'

// task 3.5/26: `errors.ts` decide o que é retryable e como um erro cru vira ApiError — é a
// lógica que o retry do TanStack Query e as telas de erro consomem. Estava só coberta de
// raspão pelo client.test.ts.

describe('ApiError.retryable', () => {
  test('rede e cancelamento são retryable; HTTP depende do status', () => {
    expect(new ApiError('x', { kind: 'network' }).retryable).toBe(true)
    expect(new ApiError('x', { kind: 'aborted' }).retryable).toBe(true)
    for (const status of [408, 425, 429, 500, 502, 503, 504]) {
      expect(new ApiError('x', { kind: 'http', status }).retryable).toBe(true)
    }
    for (const status of [400, 401, 403, 404, 409, 422]) {
      expect(new ApiError('x', { kind: 'http', status }).retryable).toBe(false)
    }
  })

  test('isRetryableApiError só reconhece ApiError', () => {
    expect(isRetryableApiError(new ApiError('x', { kind: 'network' }))).toBe(true)
    expect(isRetryableApiError(new Error('boom'))).toBe(false)
    expect(isRetryableApiError('boom')).toBe(false)
  })
})

describe('normalizeDetail', () => {
  test('string passa; array mantém só objetos; resto vira null', () => {
    expect(normalizeDetail('campo obrigatório')).toBe('campo obrigatório')
    expect(
      normalizeDetail([{ loc: ['body', 'x'], msg: 'req' }, 'ruído', 42, null]),
    ).toEqual([{ loc: ['body', 'x'], msg: 'req' }])
    expect(normalizeDetail(undefined)).toBeNull()
    expect(normalizeDetail(123)).toBeNull()
  })
})

describe('errorFromResponse', () => {
  test('extrai detail string e o anexa à mensagem', async () => {
    const res = new Response(JSON.stringify({ detail: 'token expirado' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })
    const err = await errorFromResponse(res)
    expect(err.kind).toBe('http')
    expect(err.status).toBe(401)
    expect(err.detail).toBe('token expirado')
    expect(err.message).toContain('token expirado')
  })

  test('corpo não-JSON ainda vira ApiError pelo status', async () => {
    const res = new Response('<html>502</html>', { status: 502 })
    const err = await errorFromResponse(res)
    expect(err.status).toBe(502)
    expect(err.detail).toBeNull()
    expect(err.retryable).toBe(true)
  })
})

describe('normalizeRequestError', () => {
  test('passa um ApiError adiante inalterado', () => {
    const original = new ApiError('x', { kind: 'network' })
    expect(normalizeRequestError(original)).toBe(original)
  })

  test('DOMException AbortError vira kind "aborted"', () => {
    const err = normalizeRequestError(
      new DOMException('aborted', 'AbortError'),
    )
    expect(err.kind).toBe('aborted')
    expect(err.retryable).toBe(true)
  })

  test('Error com name AbortError vira kind "aborted"', () => {
    const raw = new Error('aborted')
    raw.name = 'AbortError'
    expect(normalizeRequestError(raw).kind).toBe('aborted')
  })

  test('qualquer outra coisa vira kind "network"', () => {
    expect(normalizeRequestError(new TypeError('fetch failed')).kind).toBe(
      'network',
    )
    expect(normalizeRequestError('cabo desconectado').kind).toBe('network')
  })
})
