import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router'
import { beforeEach, expect, test } from 'vitest'

import { renderWithProviders } from '@/test/render'

import { AppShell } from './AppShell'

beforeEach(() => {
  localStorage.clear()
})

function renderShell() {
  return renderWithProviders(
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<p>conteúdo inicial</p>} />
      </Route>
    </Routes>,
  )
}

test('a navegação principal tem ícone + rótulo por tela', () => {
  renderShell()
  const nav = screen.getByRole('navigation', { name: 'Navegação principal' })
  for (const label of [
    'Market Flip',
    'Refino',
    'Craft',
    'Itens',
    'Calculadora',
    'Tokens',
  ]) {
    const link = within(nav).getByRole('link', { name: label })
    expect(link.querySelector('svg')).toBeInTheDocument()
  }
})

test('servidor e tema são selects acessíveis, sempre visíveis', () => {
  renderShell()
  expect(screen.getByRole('combobox', { name: 'Servidor' })).toBeInTheDocument()
  expect(screen.getByRole('combobox', { name: 'Tema' })).toBeInTheDocument()
})

test('no mobile a navegação abre num Sheet lateral', async () => {
  const user = userEvent.setup()
  renderShell()

  await user.click(screen.getByRole('button', { name: 'Abrir menu' }))
  const dialog = await screen.findByRole('dialog')
  expect(
    within(dialog).getByRole('link', { name: 'Calculadora' }),
  ).toBeInTheDocument()
})
