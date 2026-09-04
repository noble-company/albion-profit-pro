import { readFileSync } from 'node:fs'

import { wcagContrast } from 'culori'
import { describe, expect, test } from 'vitest'

// F02 / task 3.5/12: os tokens de design precisam cumprir WCAG AA. Este teste lê os valores
// reais de src/index.css (fonte única) e afere o contraste de cada par que o produto usa —
// texto sobre fundo e os pares de cor de tabela densa. Se alguém escurecer um token abaixo
// do limite, o teste quebra aqui, não em produção.

const AA_TEXT = 4.5 // texto normal
const AA_LARGE = 3 // texto grande / componentes de UI

const css = readFileSync('src/index.css', 'utf8')

/** Extrai as primitivas `--nome: <cor>;` do bloco :root (ignora as linhas var(--...)). */
function readTokens(source: string): Record<string, string> {
  const tokens: Record<string, string> = {}
  const re = /--([a-z-]+):\s*(oklch\([^;]+\)|#[0-9a-fA-F]+)\s*;/g
  let match: RegExpExecArray | null
  while ((match = re.exec(source))) {
    const [, name, value] = match
    if (name && value) tokens[name] = value.trim()
  }
  return tokens
}

const t = readTokens(css)

function contrast(a: string, b: string): number {
  const fg = t[a]
  const bg = t[b]
  if (!fg || !bg) throw new Error(`token ausente: --${a} ou --${b}`)
  return wcagContrast(fg, bg)
}

describe('tokens de design cumprem WCAG AA', () => {
  test('index.css expôs as primitivas esperadas', () => {
    for (const name of [
      'background',
      'surface',
      'surface-raised',
      'foreground',
      'foreground-muted',
      'foreground-subtle',
      'on-primary',
      'primary',
      'success',
      'danger',
      'info',
      'profit',
      'buy-side',
      'sell-side',
    ]) {
      expect(t[name], `token --${name}`).toBeTruthy()
    }
  })

  test.each([
    ['foreground', 'background'],
    ['foreground', 'surface'],
    ['foreground', 'surface-raised'],
    ['foreground-muted', 'background'],
    ['foreground-muted', 'surface'],
    ['foreground-subtle', 'background'],
    ['foreground-subtle', 'surface'],
  ])('texto %s sobre %s ≥ AA (%s)', (fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(AA_TEXT)
  })

  test.each([
    ['primary', 'background'],
    ['primary', 'surface'],
    ['profit', 'background'],
    ['profit', 'surface'],
    ['buy-side', 'background'],
    ['buy-side', 'surface'],
    ['sell-side', 'background'],
    ['sell-side', 'surface'],
    ['danger', 'background'],
    ['danger', 'surface'],
    ['info', 'background'],
  ])('cor semântica %s sobre %s ≥ AA grande (%s)', (fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(AA_LARGE)
  })

  test.each([
    ['on-primary', 'primary'],
    ['on-primary', 'success'],
    ['on-primary', 'danger'],
  ])('texto %s sobre a superfície %s ≥ AA', (fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(AA_TEXT)
  })
})
