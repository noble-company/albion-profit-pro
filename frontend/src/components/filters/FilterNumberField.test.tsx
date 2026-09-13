import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import { FilterNumberField } from '.'

/**
 * Task 4/14 (corrige `E05`). A Calculadora não submetia e não dizia por quê: a regra bloqueava e
 * nenhuma mensagem aparecia. Sem `aria-invalid` e `aria-describedby`, nem o leitor de tela sabia.
 */

test('com erro, o campo diz o quê — para o olho e para o leitor de tela', () => {
  render(
    <FilterNumberField
      label="Receitas a fazer"
      value="0"
      onChange={() => {}}
      error="Use um número inteiro a partir de 1"
    />,
  )

  const campo = screen.getByRole('textbox', { name: /Receitas a fazer/ })
  expect(campo).toHaveAttribute('aria-invalid', 'true')

  const descricao = document.getElementById(campo.getAttribute('aria-describedby') ?? '')
  expect(descricao).toHaveTextContent('Use um número inteiro a partir de 1')
  // A mensagem não entra no nome do campo: o nome continua sendo o rótulo.
  expect(campo).toHaveAccessibleName('Receitas a fazer')
})

test('sem erro, nada de aria-invalid nem descrição solta', () => {
  render(<FilterNumberField label="Receitas a fazer" value="300" onChange={() => {}} />)

  const campo = screen.getByRole('textbox', { name: /Receitas a fazer/ })
  expect(campo).not.toHaveAttribute('aria-invalid')
  expect(campo).not.toHaveAttribute('aria-describedby')
})
