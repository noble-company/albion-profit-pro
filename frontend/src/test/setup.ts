import '@testing-library/jest-dom/vitest'

import { server } from './msw/server'

// jsdom não implementa matchMedia; o `sonner` (Toaster) e o ThemeContext usam.
if (!window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })
}

server.listen({ onUnhandledRequest: 'error' })
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

afterEach(() => {
  document.body.innerHTML = ''
  delete document.documentElement.dataset.theme
  document.documentElement.style.removeProperty('color-scheme')
})
