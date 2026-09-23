import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { Route, Routes } from 'react-router'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { renderWithProviders } from '@/test/render'
import { server } from '@/test/msw/server'

import { SavedCraftsPage } from './SavedCraftsPage'

vi.mock('idb-keyval', () => ({
  get: () => Promise.resolve(undefined),
  set: () => Promise.resolve(),
  del: () => Promise.resolve(),
}))

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    measure: () => undefined,
    measureElement: () => undefined,
    getTotalSize: () => count * 56,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({ index, start: index * 56 })),
  }),
}))

const NOW = Math.floor(Date.now() / 1000)
const LOCATIONS = [
  { location_id: '1002', name: 'Lymhurst', display_name: 'Lymhurst', kind: 'city', is_royal_city: true },
]
const CATALOG = {
  version: 'v1', kind: null,
  items: [
    { unique_name: 'T4_MAIN_SWORD', name_pt: 'Espada Larga do Adepto', tier: 4, enchantment_level: 0, weight: '1', item_value: '0' },
    { unique_name: 'T4_METALBAR', name_pt: 'Barra de Aço', tier: 4, enchantment_level: 0 },
  ],
  recipes: [{
    output_item: 'T4_MAIN_SWORD', production_kind: 'crafting', enchantment_level: 0,
    silver_cost: 0, crafting_focus: 0, amount_crafted: 1,
    ingredients: [{ item: 'T4_METALBAR', count: 1, enchantment_level: 0, return_eligible: true }],
    upgrade_resource: null,
  }],
}
const saved = (id: string, quantity: number, outputItem = 'T4_MAIN_SWORD') => ({
  id, server: 'west', output_item: outputItem, quantity, output_quality: 1,
  created_at: '2026-09-14T12:00:00Z', updated_at: '2026-09-14T12:00:00Z',
})
const snapshot = (hoursOld = 1) => ({
  server: 'west', generated_at: new Date().toISOString(), row_count: 2,
  items: ['T4_MAIN_SWORD', 'T4_METALBAR'], locations: ['1002'], sources: ['client'],
  columns: {
    item: [0, 1], location: [0, 0], quality: [1, 1], enchantment: [0, 0],
    sell_min: [null, '100'], sell_observed_at: [null, NOW - hoursOld * 3600], sell_source: [null, 0],
    buy_max: ['1000', null], buy_observed_at: [NOW - hoursOld * 3600, null], buy_source: [0, null],
  },
})
const SALES = {
  server: 'west', days: 7, row_count: 1, items: ['T4_MAIN_SWORD'], locations: ['1002'],
  columns: { item: [0], location: [0], quality: [1], units_per_day: ['12'], average_price: ['900'], days_with_data: [7] },
}

function open(path = '/meus-crafts') {
  return renderWithProviders(
    <Routes><Route path="/meus-crafts" element={<SavedCraftsPage />} /></Routes>,
    { initialEntries: [path] },
  )
}

function setup(crafts: ReturnType<typeof saved>[], hoursOld = 1) {
  const calls = { snapshot: 0, catalog: 0, removed: '' }
  server.use(
    http.get('http://localhost:8000/locations', () => HttpResponse.json(LOCATIONS)),
    http.get('http://localhost:8000/me/saved-crafts', () => HttpResponse.json(crafts)),
    http.get('http://localhost:8000/catalog/recipes', () => {
      calls.catalog += 1
      return HttpResponse.json(CATALOG)
    }),
    http.get('http://localhost:8000/prices/snapshot', () => {
      calls.snapshot += 1
      return HttpResponse.json(snapshot(hoursOld))
    }),
    http.get('http://localhost:8000/prices/sales', () => HttpResponse.json(SALES)),
    http.delete('http://localhost:8000/me/saved-crafts/:id', ({ params }) => {
      calls.removed = String(params.id)
      return new HttpResponse(null, { status: 204 })
    }),
  )
  return calls
}

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('albion-profit-pro:realm', 'west')
})

describe('Meus Crafts A07', () => {
  test('vazio orienta a salvar nas três telas sem pedir mercado', async () => {
    const calls = setup([])
    open()

    expect(await screen.findByText('Sua bancada ainda está vazia')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Refino' })).toHaveAttribute('href', '/refino')
    expect(screen.getByRole('link', { name: 'Craft' })).toHaveAttribute('href', '/craft')
    expect(screen.getByRole('link', { name: 'Comida & Poções' })).toHaveAttribute('href', '/consumiveis')
    expect(calls.snapshot).toBe(0)
  })

  test('mantém duas entradas iguais e remove só a confirmada', async () => {
    const user = userEvent.setup()
    const calls = setup([saved('craft-a', 3), saved('craft-b', 8)])
    open()

    await waitFor(() =>
      expect(screen.getByText((_, element) =>
        element?.tagName === 'P' && element.textContent?.includes('2 crafts salvos') === true,
      )).toBeInTheDocument(),
    )
    const removeButtons = await screen.findAllByRole('button', { name: /Remover Espada Larga/ })
    expect(removeButtons).toHaveLength(2)
    await user.click(removeButtons[0]!)
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))

    await waitFor(() =>
      expect(screen.getByText((_, element) =>
        element?.tagName === 'P' && element.textContent?.includes('1 crafts salvos') === true,
      )).toBeInTheDocument(),
    )
    expect(calls.removed).toBe('craft-a')
  })

  test('reconhece receita de refino e oferece retorno para a aba correta', async () => {
    setup([saved('refining-a', 12, 'T4_CLOTH')])
    server.use(
      http.get('http://localhost:8000/catalog/recipes', () => HttpResponse.json({
        version: 'v1',
        kind: null,
        items: [
          { unique_name: 'T4_CLOTH', name_pt: 'Tecido', tier: 4, enchantment_level: 0 },
          { unique_name: 'T4_FIBER', name_pt: 'Fibra', tier: 4, enchantment_level: 0 },
        ],
        recipes: [{
          output_item: 'T4_CLOTH', production_kind: 'refining', enchantment_level: 0,
          silver_cost: 0, crafting_focus: 0, amount_crafted: 1,
          ingredients: [{ item: 'T4_FIBER', count: 1, enchantment_level: 0, return_eligible: true }],
          upgrade_resource: null,
        }],
      })),
      http.get('http://localhost:8000/prices/snapshot', () => HttpResponse.json({
        server: 'west', generated_at: new Date().toISOString(), row_count: 2,
        items: ['T4_CLOTH', 'T4_FIBER'], locations: ['1002'], sources: ['client'],
        columns: {
          item: [0, 1], location: [0, 0], quality: [1, 1], enchantment: [0, 0],
          sell_min: [null, '100'], sell_observed_at: [null, NOW - 3600], sell_source: [null, 0],
          buy_max: ['500', null], buy_observed_at: [NOW - 3600, null], buy_source: [0, null],
        },
      })),
    )
    open()

    const link = await screen.findByRole('link', { name: /Abrir Tecido em Refino/ })
    expect(link).toHaveAttribute('href', '/refino?q=T4_CLOTH&qty=12')
    await userEvent.setup().click(screen.getByRole('button', { name: /Abrir Tecido/ }))
    expect(await screen.findByRole('link', { name: 'Abrir no Refino' })).toHaveAttribute(
      'href',
      '/refino?q=T4_CLOTH&qty=12',
    )
  })

  test('max_age refaz a conta local e mostra a procedência vencida sem nova consulta', async () => {
    const user = userEvent.setup()
    const calls = setup([saved('craft-a', 3)], 2)
    open()
    await waitFor(() =>
      expect(screen.getByText((_, element) =>
        element?.tagName === 'P' && element.textContent?.includes('1 com cotação atual') === true,
      )).toBeInTheDocument(),
    )
    const snapshotCalls = calls.snapshot

    const age = screen.getByRole('spinbutton', { name: 'Idade máxima da cotação em horas' })
    await user.clear(age)
    await user.type(age, '1')
    await waitFor(() =>
      expect(screen.getByText((_, element) =>
        element?.tagName === 'P' && element.textContent?.includes('0 com cotação atual') === true,
      )).toBeInTheDocument(),
    )
    expect(calls.snapshot).toBe(snapshotCalls)

    await user.click(screen.getByRole('button', { name: /Abrir Espada Larga/ }))
    expect(await screen.findByText('Cotações vencidas ignoradas no cálculo')).toBeInTheDocument()
    expect(screen.getAllByText(/vencida/).length).toBeGreaterThan(0)
  })

  test('erro dos favoritos é identificado sem culpar o mercado', async () => {
    setup([])
    server.use(
      http.get('http://localhost:8000/me/saved-crafts', () => new HttpResponse(null, { status: 500 })),
    )
    open()

    expect(
      await screen.findByText('Não foi possível carregar Meus Crafts', {}, { timeout: 5000 }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Não foi possível carregar os preços')).not.toBeInTheDocument()
  })
})
