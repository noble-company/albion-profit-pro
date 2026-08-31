import { http, HttpResponse } from 'msw'
import { beforeEach, expect, test } from 'vitest'
import { createToken, revokeToken } from './service'
import { server } from '@/test/msw/server'

beforeEach(() => sessionStorage.clear())

test('criação retorna o segredo apenas ao chamador e não o persiste', async () => {
  server.use(
    http.post('http://localhost:8000/auth/tokens', () =>
      HttpResponse.json(
        { id: '1', token: 'apk_secret', created_at: '2026-08-23T20:00:00Z' },
        { status: 201 },
      ),
    ),
  )
  const created = await createToken()
  expect(created.token).toBe('apk_secret')
  expect(sessionStorage.getItem('apk_secret')).toBeNull()
})

test('revogação 404 é tratada como estado final', async () => {
  server.use(
    http.delete(
      'http://localhost:8000/auth/tokens/1',
      () => new HttpResponse(null, { status: 404 }),
    ),
  )
  await expect(revokeToken('1')).resolves.toBeUndefined()
})
