import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { useState } from 'react'
import { expect, test, vi } from 'vitest'

import { renderWithProviders } from '@/test/render'
import { server } from '@/test/msw/server'

import { ItemAutocomplete } from './ItemAutocomplete'

const RESULTS = [
  {
    unique_name: 'T4_CLOTH',
    albion_id: 1,
    name_pt: 'Pano',
    name_en: 'Cloth',
    tier: 4,
    enchantment_level: 0,
    shop_category: 'resources',
    shop_subcategory: null,
    has_recipe: true,
  },
  {
    unique_name: 'T5_CLOTH',
    albion_id: 2,
    name_pt: 'Pano',
    name_en: 'Cloth',
    tier: 5,
    enchantment_level: 0,
    shop_category: 'resources',
    shop_subcategory: null,
    has_recipe: true,
  },
]

function mockSearch() {
  server.use(
    http.get('http://localhost:8000/items/search', () =>
      HttpResponse.json(RESULTS),
    ),
  )
}

function Harness({ onSelect }: { onSelect?: (u: string) => void }) {
  const [value, setValue] = useState('')
  return (
    <ItemAutocomplete
      label="Item"
      value={value}
      onChange={setValue}
      onSelect={(item) => onSelect?.(item.unique_name)}
    />
  )
}

test('as setas movem o item ativo via aria-activedescendant; Enter seleciona', async () => {
  const user = userEvent.setup()
  const onSelect = vi.fn()
  mockSearch()
  renderWithProviders(<Harness onSelect={onSelect} />)

  const input = screen.getByRole('combobox')
  await user.type(input, 'pano')
  await screen.findByRole('option', { name: /Pano T4/ }, { timeout: 2000 })

  const options = within(screen.getByRole('listbox')).getAllByRole('option')
  await user.keyboard('{ArrowDown}')
  expect(input).toHaveAttribute('aria-activedescendant', options[0]!.id)
  await user.keyboard('{ArrowDown}')
  expect(input).toHaveAttribute('aria-activedescendant', options[1]!.id)
  await user.keyboard('{ArrowUp}')
  expect(input).toHaveAttribute('aria-activedescendant', options[0]!.id)

  await user.keyboard('{Enter}')
  expect(onSelect).toHaveBeenCalledWith('T4_CLOTH')
})

test('Escape fecha a lista', async () => {
  const user = userEvent.setup()
  mockSearch()
  renderWithProviders(<Harness />)

  await user.type(screen.getByRole('combobox'), 'pano')
  await screen.findByRole('option', { name: /Pano T4/ }, { timeout: 2000 })
  await user.keyboard('{Escape}')
  await waitFor(() =>
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument(),
  )
})

test('clicar num resultado emite o unique_name canônico', async () => {
  const user = userEvent.setup()
  const onSelect = vi.fn()
  mockSearch()
  renderWithProviders(<Harness onSelect={onSelect} />)

  await user.type(screen.getByRole('combobox'), 'pano')
  await screen.findByRole('option', { name: /Pano T4/ }, { timeout: 2000 })
  await user.click(
    within(screen.getByRole('listbox')).getAllByRole('option')[1]!,
  )
  expect(onSelect).toHaveBeenCalledWith('T5_CLOTH')
})

test('cada resultado mostra o ícone e o nome do jogo — sem o código técnico', async () => {
  // Pedido no uso (2026-09-12): "exibir os ícones dos itens na hora da busca, e não exibir o
  // nome técnico T4_MAIN_SWORD, só o nome do jogo".
  const user = userEvent.setup()
  mockSearch()
  renderWithProviders(<Harness />)

  await user.type(screen.getByRole('combobox'), 'pano')
  const opcao = await screen.findByRole('option', { name: /Pano T4/ }, { timeout: 2000 })

  expect(opcao.querySelector('img')?.getAttribute('src')).toContain('T4_CLOTH')
  expect(opcao).not.toHaveTextContent('T4_CLOTH')
})

test('menos de 2 caracteres não abre a lista', async () => {
  const user = userEvent.setup()
  mockSearch()
  renderWithProviders(<Harness />)

  await user.type(screen.getByRole('combobox'), 'p')
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  expect(
    screen.getByText('Digite pelo menos 2 caracteres.'),
  ).toBeInTheDocument()
})
