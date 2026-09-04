import { cleanup, render } from '@testing-library/react'
import { axe } from 'jest-axe'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { LinguagemVisualPage } from './LinguagemVisualPage'

// F01/F02/F05 via task 3.5/14: a página de referência precisa renderizar sem erro e sem
// violação séria de acessibilidade, nos dois temas — é o critério de "pronto" da própria task
// (revisão humana antes da task 20).
//
// color-contrast fica desligado aqui de propósito: jsdom não carrega o CSS compilado
// (index.css/Tailwind), então axe não vê cor nenhuma pintada e o resultado seria ruído. O
// contraste real dos tokens já é verificado, com valor de verdade, em src/test/contrast.test.ts.
const AXE_OPTIONS = { rules: { 'color-contrast': { enabled: false } } }

afterEach(() => {
  cleanup()
  delete document.documentElement.dataset.theme
})

describe.each(['dark', 'light'] as const)('tema %s', (theme) => {
  test('a página de referência renderiza sem erro de console', () => {
    document.documentElement.dataset.theme = theme
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      render(<LinguagemVisualPage />)
      expect(spy).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })

  test('não tem violação séria de acessibilidade (axe)', async () => {
    document.documentElement.dataset.theme = theme
    const { container } = render(<LinguagemVisualPage />)
    const results = await axe(container, AXE_OPTIONS)
    const serious = results.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? ''),
    )
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([])
  })
})
