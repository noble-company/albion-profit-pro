import { describe, expect, test } from 'vitest'

import { ALTURA_DA_LINHA_REM, remEmPx } from './altura'

/**
 * A altura da linha acompanha o tamanho da interface (pedido no uso, 2026-09-12).
 *
 * O virtualizador fala em pixels. Com a altura fixa em `44` px, aumentar a fonte da raiz fazia o
 * conteúdo crescer e a linha não: o nome em 2 linhas, com o grau embaixo, vazaria para a de baixo.
 */
describe('altura da linha da tabela', () => {
  test('cabe nome em 2 linhas e o grau embaixo', () => {
    // 44 px (`h-11`) cabia uma linha de texto só.
    expect(remEmPx(ALTURA_DA_LINHA_REM, 16)).toBeGreaterThan(44)
  })

  test('cresce na mesma proporção da fonte da raiz', () => {
    const normal = remEmPx(ALTURA_DA_LINHA_REM, 16)

    expect(remEmPx(ALTURA_DA_LINHA_REM, 16 * 1.7)).toBeCloseTo(normal * 1.7)
  })
})
