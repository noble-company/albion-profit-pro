import { act, renderHook } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { ESCALAS, useEscala } from './escala'
import { EscalaProvider } from './EscalaContext'

/**
 * Tamanho da interface (pedido no uso, 2026-09-12: "deixar tudo uns 70% maior").
 *
 * A escala é o tamanho da fonte da raiz. Quase tudo no Tailwind é `rem`, então texto,
 * espaçamento, ícones e larguras de coluna crescem juntos — sem reescrever componente.
 */

const KEY = 'albion-profit-pro:escala'

function wrapper({ children }: PropsWithChildren) {
  return <EscalaProvider>{children}</EscalaProvider>
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.style.fontSize = ''
})

afterEach(() => {
  document.documentElement.style.fontSize = ''
})

describe('tamanho da interface', () => {
  test('nasce em 100% e oferece até 220%', () => {
    const { result } = renderHook(() => useEscala(), { wrapper })

    expect(result.current.escala).toBe(100)
    expect(ESCALAS).toContain(170)
    // Pedido no uso, depois de testar os 170%: "aumentar o zoom em mais 50%".
    expect(Math.max(...ESCALAS)).toBe(220)
    expect(document.documentElement.style.fontSize).toBe('100%')
  })

  test('escolher 170% aumenta a raiz e fica salvo para a próxima visita', () => {
    const { result } = renderHook(() => useEscala(), { wrapper })

    act(() => result.current.setEscala(170))

    expect(document.documentElement.style.fontSize).toBe('170%')
    expect(localStorage.getItem(KEY)).toBe('170')
  })

  test('a escolha salva volta ao abrir', () => {
    localStorage.setItem(KEY, '130')

    const { result } = renderHook(() => useEscala(), { wrapper })

    expect(result.current.escala).toBe(130)
    expect(document.documentElement.style.fontSize).toBe('130%')
  })

  test('valor salvo que não é uma das opções volta para 100%, nunca uma tela gigante', () => {
    localStorage.setItem(KEY, '9000')

    expect(renderHook(() => useEscala(), { wrapper }).result.current.escala).toBe(100)
  })
})
