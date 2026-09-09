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

test('servidor e tema são alcançáveis nos dois breakpoints', () => {
  // O shell de sidebar (task 4/08) renderiza os controles de contexto **duas vezes**: no rodapé
  // da coluna esquerda (desktop) e na barra fina superior (mobile). Só um par fica visível por
  // vez, via `md:hidden` / `hidden md:flex` — mas jsdom não aplica CSS, então os dois aparecem
  // na consulta. O invariante que importa é o de `13-linguagem-visual.md` §6: **servidor errado
  // é erro de leitura**, e o usuário não deveria precisar abrir menu nenhum para corrigir.
  renderShell()

  const sidebar = document.querySelector('aside')!
  expect(within(sidebar).getByRole('combobox', { name: 'Servidor' })).toBeInTheDocument()
  expect(within(sidebar).getByRole('combobox', { name: 'Tema' })).toBeInTheDocument()

  // Fora da sidebar (barra mobile), sem depender de abrir o Sheet.
  expect(screen.getAllByRole('combobox', { name: 'Servidor' })).toHaveLength(2)
  expect(screen.getAllByRole('combobox', { name: 'Tema' })).toHaveLength(2)
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
