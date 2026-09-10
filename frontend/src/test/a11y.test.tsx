import { cleanup, screen, waitFor } from '@testing-library/react'
import { axe } from 'jest-axe'
import { http, HttpResponse } from 'msw'
import type { ReactElement } from 'react'
import { Route, Routes } from 'react-router'
import { afterEach, beforeEach, expect, test } from 'vitest'

import { CalculadoraPage } from '@/craft/pages'
import { BuscaItem } from '@/items/pages'
import { MarketFlipPage } from '@/opportunities/pages'
import { RefiningScannerPage } from '@/scanner/ScannerPage'
import { ItemPricesPage } from '@/prices/pages'
import { TokensPage } from '@/tokens/pages'

import { renderWithProviders } from './render'
import { server } from './msw/server'

// F10 / task 3.5/25: nenhuma tela do produto pode ter violação SÉRIA de acessibilidade.
// `color-contrast` desligado: o jsdom não carrega o CSS compilado, então axe não vê cor
// pintada — o contraste real dos tokens é checado em src/test/contrast.test.ts.
const AXE_OPTIONS = { rules: { 'color-contrast': { enabled: false } } }

const EMPTY_FLIP = {
  server: 'west',
  kind: 'flip',
  opportunities: [],
  total: 0,
  limit: 25,
  offset: 0,
}
beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('albion-profit-pro:realm', 'west')
  server.use(
    http.get('http://localhost:8000/locations', () => HttpResponse.json([])),
    http.get('http://localhost:8000/items/categories', () =>
      HttpResponse.json([]),
    ),
    http.get('http://localhost:8000/items/search', () => HttpResponse.json([])),
    http.get('http://localhost:8000/opportunities/flips', () =>
      HttpResponse.json(EMPTY_FLIP),
    ),
    http.get('http://localhost:8000/items/:item/prices', () =>
      HttpResponse.json({
        server: 'west',
        item_id: 'T4_CLOTH',
        scope: 'all',
        prices: [],
        total: 0,
        limit: 20,
        offset: 0,
      }),
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
      'http://localhost:8000/items/:item/demand',
      () => new HttpResponse(null, { status: 422 }),
    ),
    http.get('http://localhost:8000/auth/tokens', () => HttpResponse.json([])),
  )
})

afterEach(cleanup)

async function expectNoSeriousViolations(
  ui: ReactElement,
  waitForText: RegExp,
  initialEntries?: string[],
) {
  const { container } = renderWithProviders(ui, { initialEntries })
  await waitFor(() => expect(screen.getByText(waitForText)).toBeInTheDocument())
  const results = await axe(container, AXE_OPTIONS)
  const serious = results.violations.filter((violation) =>
    ['serious', 'critical'].includes(violation.impact ?? ''),
  )
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([])
}

test('Market Flip — sem violação séria (axe)', async () => {
  await expectNoSeriousViolations(
    <MarketFlipPage />,
    /Encontre o próximo lucro/,
  )
})

test('Refino — sem violação séria (axe)', async () => {
  // Passou a apontar para a tela do scanner na task 4/15: a antiga foi apagada junto com o
  // ranking materializado. O título é o mesmo, e a cobertura de acessibilidade continua na
  // tela que o usuário de fato abre.
  await expectNoSeriousViolations(
    <RefiningScannerPage />,
    /O que vale a pena refinar/,
  )
})

test('Calculadora — sem violação séria (axe)', async () => {
  await expectNoSeriousViolations(<CalculadoraPage />, /Calculadora de craft/)
})

test('Busca — sem violação séria (axe)', async () => {
  await expectNoSeriousViolations(<BuscaItem />, /Busca de itens/)
})

test('Preços — sem violação séria (axe)', async () => {
  await expectNoSeriousViolations(
    <Routes>
      <Route path="/item/:uniqueName" element={<ItemPricesPage />} />
    </Routes>,
    /Pano T4/,
    ['/item/T4_CLOTH'],
  )
})

test('Tokens — sem violação séria (axe)', async () => {
  await expectNoSeriousViolations(<TokensPage />, /Tokens de API/)
})
