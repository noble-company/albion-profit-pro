import { act, renderHook } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { ESCALAS, useEscala } from './escala'
import { EscalaProvider } from './EscalaContext'

/**
 * Tamanho do conteúdo (pedidos no uso, 2026-09-12).
 *
 * Primeiro "deixar tudo uns 70% maior"; depois de ver, "aumenta só o conteúdo da tabela, não de
 * tudo" — as barras laterais ficam como estão. O provider só guarda a escolha; quem aplica é o
 * `main` do shell (`AppShell.test.tsx`).
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

describe('tamanho do conteúdo', () => {
  test('nasce em 100% e oferece até 220%', () => {
    const { result } = renderHook(() => useEscala(), { wrapper })

    expect(result.current.escala).toBe(100)
    expect(ESCALAS).toContain(170)
    // Pedido no uso, depois de testar os 170%: "aumentar o zoom em mais 50%".
    expect(Math.max(...ESCALAS)).toBe(220)
  })

  test('escolher 170% fica salvo para a próxima visita', () => {
    const { result } = renderHook(() => useEscala(), { wrapper })

    act(() => result.current.setEscala(170))

    expect(result.current.escala).toBe(170)
    expect(localStorage.getItem(KEY)).toBe('170')
  })

  test('NÃO mexe na fonte da página: as barras laterais ficam do tamanho de sempre', () => {
    const { result } = renderHook(() => useEscala(), { wrapper })

    act(() => result.current.setEscala(220))

    expect(document.documentElement.style.fontSize).toBe('')
  })

  test('a escolha salva volta ao abrir', () => {
    localStorage.setItem(KEY, '130')

    expect(renderHook(() => useEscala(), { wrapper }).result.current.escala).toBe(130)
  })

  test('valor salvo que não é uma das opções volta para 100%, nunca uma tela gigante', () => {
    localStorage.setItem(KEY, '9000')

    expect(renderHook(() => useEscala(), { wrapper }).result.current.escala).toBe(100)
  })
})
