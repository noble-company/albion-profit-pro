import '@testing-library/jest-dom/vitest'

import { server } from './msw/server'

server.listen({ onUnhandledRequest: 'error' })
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

afterEach(() => {
  document.body.innerHTML = ''
})
