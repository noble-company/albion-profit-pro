import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { Route, Routes } from 'react-router'
import { beforeEach, expect, test } from 'vitest'

import { renderWithProviders } from '@/test/render'
import { server } from '@/test/msw/server'

import { ItemPricesPage } from './pages'

const price = (overrides: Record<string, unknown> = {}) => ({
  location_id: '1002',
  quality_level: 1,
  enchantment_level: 0,
  sell: { best_price: '1200', observed_at: new Date().toISOString() },
  buy: { best_price: '900', observed_at: new Date().toISOString() },
  sold_24h: { units: 40 },
  ...overrides,
})

function renderPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/item/:uniqueName" element={<ItemPricesPage />} />
    </Routes>,
    { initialEntries: ['/item/T4_CLOTH'] },
  )
}

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('albion-profit-pro:realm', 'west')
  server.use(
    http.get('http://localhost:8000/locations', () =>
      HttpResponse.json([
        {
          location_id: '1002',
          name: 'Lymhurst',
          display_name: 'Lymhurst',
          kind: 'city',
          is_royal_city: true,
        },
      ]),
    ),
    http.get('http://localhost:8000/items/T4_CLOTH', () =>
      HttpResponse.json({
        unique_name: 'T4_CLOTH',
        albion_id: 1,
        name_pt: 'Pano',
        name_en: 'Cloth',
        tier: 4,
        enchantment_level: 0,
        shop_category: 'resources',
        shop_subcategory: null,
        has_recipe: false,
      }),
    ),
    http.get(
      'http://localhost:8000/items/T4_CLOTH/demand',
      () => new HttpResponse(null, { status: 422 }),
    ),
  )
})

test('mostra o nome do item, com o identificador cru como subtítulo', async () => {
  server.use(
    http.get('http://localhost:8000/items/T4_CLOTH/prices', () =>
      HttpResponse.json({
        server: 'west',
        item_id: 'T4_CLOTH',
        scope: 'all',
        prices: [price()],
        total: 1,
        limit: 20,
        offset: 0,
      }),
    ),
  )

  renderPage()

  expect(
    await screen.findByRole('heading', { name: 'Pano T4', level: 1 }),
  ).toBeInTheDocument()
  expect(screen.getByText('T4_CLOTH')).toBeInTheDocument()
})

test('o filtro de qualidade altera o total exibido (task 17 pela UI)', async () => {
  server.use(
    http.get('http://localhost:8000/items/T4_CLOTH/prices', ({ request }) => {
      const quality = new URL(request.url).searchParams.get('quality_level')
      return HttpResponse.json({
        server: 'west',
        item_id: 'T4_CLOTH',
        scope: 'all',
        prices: [price()],
        total: quality ? 3 : 25,
        limit: 20,
        offset: 0,
      })
    }),
  )

  renderPage()
  await waitFor(() => expect(screen.getByText(/de 25/)).toBeInTheDocument())

  const user = userEvent.setup()
  await user.selectOptions(screen.getByLabelText('Qualidade'), '3')

  await waitFor(() =>
    expect(screen.getByText(/de 3 filtrados/)).toBeInTheDocument(),
  )
})
