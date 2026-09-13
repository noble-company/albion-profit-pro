import { describe, expect, test } from 'vitest'

import { ALTURA_DA_LINHA_REM, alturaDaLinhaPx, emEscala } from './altura'

/**
 * A altura da linha acompanha o Tamanho do conteúdo (pedidos no uso, 2026-09-12).
 *
 * O virtualizador fala em pixels. Com a altura fixa, o conteúdo da linha cresceria e a linha não:
 * o nome em 2 linhas, com o grau embaixo, vazaria para a de baixo.
 */
describe('altura da linha da tabela', () => {
  test('cabe nome em 2 linhas e o grau embaixo', () => {
    // 44 px (`h-11`) cabia uma linha de texto só.
    expect(alturaDaLinhaPx(100, 16)).toBeGreaterThan(44)
  })

  test('cresce com o Tamanho do conteúdo, na mesma proporção', () => {
    expect(alturaDaLinhaPx(170, 16)).toBeCloseTo(alturaDaLinhaPx(100, 16) * 1.7)
  })

  test('a medida de CSS usa a variável do centro, não um rem fixo', () => {
    expect(emEscala(ALTURA_DA_LINHA_REM)).toBe('calc(3.5rem * var(--escala, 1))')
  })
})
