import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { App } from '@/App'
import { renderWithProviders } from '@/test/render'

describe('App', () => {
  it('renderiza a fundação acessível da aplicação', () => {
    renderWithProviders(<App />)

    expect(screen.getByRole('heading', { name: 'Entrar' })).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Criar conta' }),
    ).toBeInTheDocument()
  })
})
