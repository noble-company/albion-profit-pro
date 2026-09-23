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

test('a marca aparece na navegação expandida e recolhida', () => {
  const expanded = renderShell()
  const expandedSidebar = document.querySelector('aside')!
  const expandedBrand = within(expandedSidebar).getByRole('link', {
    name: 'Albion Profit Pro',
  })
  expect(expandedBrand.querySelector('img')).toHaveAttribute('alt', '')

  expanded.unmount()
  localStorage.setItem('albion-profit-pro:nav-collapsed', 'true')
  renderShell()
  const collapsedSidebar = document.querySelector('aside')!
  const collapsedBrand = within(collapsedSidebar).getByRole('link', {
    name: 'Albion Profit Pro',
  })
  expect(collapsedBrand.querySelector('img')).toHaveAttribute('alt', '')
})

test('a navegação principal tem ícone + rótulo por tela', () => {
  renderShell()
  const nav = screen.getByRole('navigation', { name: 'Navegação principal' })
  for (const label of [
    'Market Flip',
    'Refino',
    'Craft',
    // Task 4/13: comida, poção e os insumos da cozinha saíram do Craft para uma aba própria.
    'Comida & Poções',
    'Meus Crafts',
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
  expect(
    within(sidebar).getByRole('combobox', { name: 'Servidor' }),
  ).toBeInTheDocument()
  expect(
    within(sidebar).getByRole('combobox', { name: 'Tema' }),
  ).toBeInTheDocument()
  // Pedido no uso (2026-09-12): aumentar a interface inteira fica junto do tema.
  expect(
    within(sidebar).getByRole('combobox', { name: 'Tamanho' }),
  ).toBeInTheDocument()

  // Fora da sidebar (barra mobile), sem depender de abrir o Sheet.
  expect(screen.getAllByRole('combobox', { name: 'Servidor' })).toHaveLength(2)
  expect(screen.getAllByRole('combobox', { name: 'Tema' })).toHaveLength(2)
})

test('o Tamanho escala só o conteúdo do centro, não as barras laterais', () => {
  // Pedido no uso (2026-09-12): "aumenta o tamanho só do conteúdo da tabela, não de tudo".
  localStorage.setItem('albion-profit-pro:escala', '170')
  renderShell()

  const centro = document.getElementById('conteudo')!
  expect(centro).toHaveClass('escala-do-conteudo')
  expect(centro.style.getPropertyValue('--escala')).toBe('1.7')

  for (const barra of document.querySelectorAll('aside')) {
    expect(barra.style.getPropertyValue('--escala')).toBe('')
  }
  expect(document.documentElement.style.fontSize).toBe('')
})

test('com a navegação recolhida, o Tamanho continua ao alcance', () => {
  // A primeira versão só mostrava o seletor com a barra aberta — e quem usa a barra recolhida
  // nunca o encontrou.
  localStorage.setItem('albion-profit-pro:nav-collapsed', 'true')
  renderShell()

  const sidebar = document.querySelector('aside')!
  expect(
    within(sidebar).getByRole('combobox', { name: 'Tamanho' }),
  ).toBeInTheDocument()
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
