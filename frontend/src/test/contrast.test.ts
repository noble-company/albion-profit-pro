import { wcagContrast } from 'culori'
import { describe, expect, test } from 'vitest'

import { readTokens, readThemeBlocks } from './theme-tokens'

// F02 (task 3.5/12) + F03 (task 3.5/13): os tokens de design precisam cumprir WCAG AA nos
// DOIS temas. Este teste lê os valores reais de src/index.css (fonte única) e afere o
// contraste de cada par que o produto usa — texto sobre fundo e os pares de cor de tabela
// densa — para o bloco :root (escuro, padrão) e para :root[data-theme='light']. Se alguém
// escurecer/clarear um token abaixo do limite, ou esquecer de redefinir um token só num dos
// temas, o teste quebra aqui, não em produção.

const AA_TEXT = 4.5 // texto normal
const AA_LARGE = 3 // texto grande / componentes de UI

const blocks = readThemeBlocks()

const THEMES = {
  escuro: readTokens(blocks.dark),
  claro: readTokens(blocks.light),
} as const

const COLOR_TOKEN_NAMES = [
  'background',
  'surface',
  'surface-raised',
  'border',
  'border-strong',
  'foreground',
  'foreground-muted',
  'foreground-subtle',
  'on-primary',
  'primary',
  'primary-hover',
  'success',
  'warning',
  'danger',
  'info',
  'profit',
  'buy-side',
  'sell-side',
] as const

test('nenhum token de cor existe em só um dos temas', () => {
  for (const name of COLOR_TOKEN_NAMES) {
    expect(THEMES.escuro[name], `--${name} no tema escuro`).toBeTruthy()
    expect(THEMES.claro[name], `--${name} no tema claro`).toBeTruthy()
  }
})

test('o tema claro de fato redefine as primitivas (não é uma cópia do escuro)', () => {
  expect(THEMES.claro.background).not.toBe(THEMES.escuro.background)
  expect(THEMES.claro.foreground).not.toBe(THEMES.escuro.foreground)
})

describe.each(Object.entries(THEMES))('tema %s cumpre WCAG AA', (_label, t) => {
  function contrast(a: string, b: string): number {
    const fg = t[a]
    const bg = t[b]
    if (!fg || !bg) throw new Error(`token ausente: --${a} ou --${b}`)
    return wcagContrast(fg, bg)
  }

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
