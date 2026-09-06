import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, expect, test } from 'vitest'

import { renderWithProviders } from '@/test/render'
import { server } from '@/test/msw/server'

import { CalculadoraPage } from './pages'

const PREFS = 'albion-profit-pro:calculator:v1'

const LOCATIONS = [
  {
    location_id: '1002',
    name: 'Lymhurst',
    display_name: 'Lymhurst',
    kind: 'city',
    is_royal_city: true,
  },
]

const SEARCH = [
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
]

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('albion-profit-pro:realm', 'west')
  server.use(
    http.get('http://localhost:8000/locations', () =>
      HttpResponse.json(LOCATIONS),
    ),
    http.get('http://localhost:8000/items/search', () =>
      HttpResponse.json(SEARCH),
    ),
  )
})

afterEach(() => localStorage.clear())

test('escolher pelo autocomplete preenche o item e a simulação o envia', async () => {
  const user = userEvent.setup()
  let body: Record<string, unknown> | undefined
  server.use(
    http.post('http://localhost:8000/craft/simulate', async ({ request }) => {
      body = (await request.json()) as Record<string, unknown>
      return new HttpResponse(null, { status: 500 })
    }),
  )

  renderWithProviders(<CalculadoraPage />)

  await user.type(screen.getByRole('combobox', { name: /Item/ }), 'pano')
  await screen.findByRole('option', { name: /Pano T4/ }, { timeout: 2000 })
  await user.click(screen.getByRole('option', { name: /Pano T4/ }))

  await user.selectOptions(screen.getByLabelText('Cidade'), '1002')
  await user.click(screen.getByRole('button', { name: 'Simular craft' }))

  await waitFor(() => expect(body).toBeDefined())
  expect(body).toMatchObject({
    server: 'west',
    output_item: 'T4_CLOTH',
    location_id: '1002',
  })
})

test('as preferências persistidas são restauradas ao reabrir a tela', () => {
  localStorage.setItem(
    PREFS,
    JSON.stringify({
      version: 1,
      output_quality: 4,
      scope: 'mine',
      premium: false,
      use_focus: true,
    }),
  )

  renderWithProviders(<CalculadoraPage />)

  expect(screen.getByLabelText('Qualidade')).toHaveValue('4')
  expect(screen.getByLabelText('Escopo')).toHaveValue('mine')
  expect(screen.getByLabelText('Premium')).not.toBeChecked()
  expect(screen.getByLabelText('Usar foco')).toBeChecked()
})

test('o botão de retry refaz a última simulação', async () => {
  const user = userEvent.setup()
  let calls = 0
  server.use(
    http.post('http://localhost:8000/craft/simulate', () => {
      calls += 1
      return new HttpResponse(null, { status: 500 })
    }),
  )

  renderWithProviders(<CalculadoraPage />)
  await user.type(screen.getByRole('combobox', { name: /Item/ }), 'pano')
  await screen.findByRole('option', { name: /Pano T4/ }, { timeout: 2000 })
  await user.click(screen.getByRole('option', { name: /Pano T4/ }))
  await user.selectOptions(screen.getByLabelText('Cidade'), '1002')
  await user.click(screen.getByRole('button', { name: 'Simular craft' }))

  const retry = await screen.findByRole('button', { name: 'Tentar novamente' })
  await user.click(retry)
  await waitFor(() => expect(calls).toBe(2))
})
