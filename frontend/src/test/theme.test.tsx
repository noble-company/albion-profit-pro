import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { ThemeProvider, useTheme } from '@/app/ThemeContext'

import { readTokens, readThemeBlocks } from './theme-tokens'

// F03 (task 3.5/13): o seletor de tema promete algo (Sistema/Claro/Escuro) e precisa cumprir.
// Estes testes verificam o MECANISMO — o valor de token computado no <html>, não a presença
// de uma classe — e a reação ao SO em tempo real, que é o que a spec pede explicitamente.

const KEY = 'albion-profit-pro:theme'

type MediaQueryMock = {
  matches: boolean
  media: string
  onchange: null
  addEventListener: (type: string, cb: () => void) => void
  removeEventListener: (type: string, cb: () => void) => void
  addListener: () => void
  removeListener: () => void
  dispatchEvent: () => boolean
}

function installMatchMedia(initialMatches: boolean) {
  let matches = initialMatches
  const listeners = new Set<() => void>()
  const mql: MediaQueryMock = {
    get matches() {
      return matches
    },
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addEventListener: (_type, cb) => listeners.add(cb),
    removeEventListener: (_type, cb) => listeners.delete(cb),
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }
  vi.stubGlobal('matchMedia', () => mql)
  return {
    setSystemPrefersDark(next: boolean) {
      matches = next
      listeners.forEach((cb) => cb())
    },
  }
}

function Probe() {
  const { theme, resolvedTheme, setTheme } = useTheme()
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="resolved">{resolvedTheme}</span>
      <button onClick={() => setTheme('light')}>Claro</button>
      <button onClick={() => setTheme('dark')}>Escuro</button>
      <button onClick={() => setTheme('system')}>Sistema</button>
    </div>
  )
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

test('trocar para Claro muda o token --background computado no <html>', async () => {
  const user = userEvent.setup()
  const { dark, light } = readThemeBlocks()
  const style = document.createElement('style')
  style.textContent = `:root {${dark}}\n:root[data-theme='light'] {${light}}`
  document.head.append(style)
  // jsdom reserializa o valor da custom property ao fazer parse do <style> (perde espaços
  // dentro de oklch(...)); comparamos sem espaço em branco, não a string exata.
  const squash = (value: string) => value.replace(/\s+/g, '')
  const darkTokens = readTokens(dark)
  const lightTokens = readTokens(light)

  localStorage.setItem(KEY, 'dark')
  installMatchMedia(false)
  render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  )
  const root = document.documentElement
  const computedBackground = () =>
    squash(getComputedStyle(root).getPropertyValue('--background'))

  expect(computedBackground()).toBe(squash(darkTokens.background ?? ''))

  await user.click(screen.getByRole('button', { name: 'Claro' }))

  const resolved = computedBackground()
  expect(resolved).toBe(squash(lightTokens.background ?? ''))
  expect(resolved).not.toBe(squash(darkTokens.background ?? ''))
  expect(root.dataset.theme).toBe('light')

  style.remove()
})

test('system acompanha prefers-color-scheme e reage à troca com a aba aberta', () => {
  const media = installMatchMedia(true) // SO em modo escuro
  render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  )

  expect(screen.getByTestId('resolved')).toHaveTextContent('dark')
  expect(document.documentElement.dataset.theme).toBe('dark')

  act(() => {
    media.setSystemPrefersDark(false)
  })

  expect(screen.getByTestId('resolved')).toHaveTextContent('light')
  expect(document.documentElement.dataset.theme).toBe('light')
})

test('a escolha sobrevive a um remontar (persistida em localStorage)', async () => {
  installMatchMedia(false)
  const user = userEvent.setup()
  const first = render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  )
  await user.click(screen.getByRole('button', { name: 'Escuro' }))
  expect(localStorage.getItem(KEY)).toBe('dark')
  first.unmount()

  render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  )
  expect(screen.getByTestId('theme')).toHaveTextContent('dark')
  expect(screen.getByTestId('resolved')).toHaveTextContent('dark')
  expect(document.documentElement.dataset.theme).toBe('dark')
})
