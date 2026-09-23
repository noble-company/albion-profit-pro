import '@testing-library/jest-dom/vitest'

import { queryClient } from '@/api/query'

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
  // test/render.tsx cria um QueryClient por render (task 3.5/26); este clear cobre os poucos
  // testes que ainda usam o singleton de produção direto.
  queryClient.clear()
  // O token de sessão vive no sessionStorage (fonte de verdade única, task 3.5/16); limpar
  // aqui garante que nenhuma sessão de um teste sobreviva pro próximo.
  try {
    sessionStorage.clear()
  } catch {
    // ignore
  }
})
