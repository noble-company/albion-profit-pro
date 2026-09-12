import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { AppShell } from '@/components/AppShell'
import { renderWithProviders } from '@/test/render'
import { server } from '@/test/msw/server'

import { CalculadoraPage } from './pages'

/**
 * Task 4/14. A Calculadora é o scanner com uma receita só: o número muda enquanto o jogador
 * digita, e só o "Analisar com o livro real" vai à rede.
 *
 * Montada dentro do `AppShell`: os controles do cenário vivem na barra da direita (`SidebarSection`
 * é um portal para o slot do shell) — fora dele eles simplesmente não existem.
 */

// jsdom não implementa IndexedDB; o cache do catálogo é testado em `catalog/hooks.test.tsx`.
vi.mock('idb-keyval', () => ({
  get: () => Promise.resolve(undefined),
  set: () => Promise.resolve(),
  del: () => Promise.resolve(),
}))

const T = Math.floor(Date.now() / 1000) - 600

const LOCATIONS = [
  { location_id: '1002', name: 'Lymhurst', display_name: 'Lymhurst', kind: 'city', is_royal_city: true },
  {
    location_id: '4002',
    name: 'Fort Sterling',
    display_name: 'Fort Sterling',
    kind: 'city',
    is_royal_city: true,
  },
]

const CRAFT = {
  version: 'v1',
  kind: 'crafting',
  items: [
    {
      unique_name: 'T4_MAIN_SWORD',
      name_pt: 'Espada Larga do Adepto',
      tier: 4,
      enchantment_level: 0,
      weight: '1',
      item_value: '256',
      shop_category: 'weapons',
      shop_subcategory: 'sword',
    },
    { unique_name: 'T4_METALBAR', name_pt: 'Barra de Aço', tier: 4, enchantment_level: 0, item_value: '16' },
  ],
  recipes: [
    {
      output_item: 'T4_MAIN_SWORD',
      production_kind: 'crafting',
      enchantment_level: 0,
      silver_cost: 0,
      crafting_focus: 0,
      amount_crafted: 1,
      ingredients: [{ item: 'T4_METALBAR', count: 16, enchantment_level: 0, return_eligible: true }],
      upgrade_resource: null,
    },
  ],
}

const REFINO = { version: 'v1', kind: 'refining', items: [], recipes: [] }

// Espada vende muito melhor em Fort Sterling; a barra custa quase o mesmo nas duas.
const SNAPSHOT = {
  server: 'west',
  generated_at: '2026-09-12T12:00:00Z',
  row_count: 4,
  items: ['T4_MAIN_SWORD', 'T4_METALBAR'],
  locations: ['1002', '4002'],
  sources: ['client'],
  columns: {
    item: [0, 0, 1, 1],
    location: [0, 1, 0, 1],
    quality: [1, 1, 1, 1],
    enchantment: [0, 0, 0, 0],
    sell_min: ['5000', '9000', '100', '110'],
    sell_observed_at: [T, T, T, T],
    sell_source: [0, 0, 0, 0],
    buy_max: ['4000', '8000', '90', '100'],
    buy_observed_at: [T, T, T, T],
    buy_source: [0, 0, 0, 0],
  },
}

const VENDAS = {
  server: 'west',
  days: 7,
  row_count: 0,
  items: [],
  locations: [],
  columns: { item: [], location: [], quality: [], units_per_day: [], average_price: [], days_with_data: [] },
}

const chamadas = { snapshot: 0, catalogo: 0, simular: 0 }

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('albion-profit-pro:realm', 'west')
  chamadas.snapshot = 0
  chamadas.catalogo = 0
  chamadas.simular = 0
  server.use(
    http.get('http://localhost:8000/locations', () => HttpResponse.json(LOCATIONS)),
    http.get('http://localhost:8000/items/search', () => HttpResponse.json([])),
    http.get('http://localhost:8000/catalog/recipes', ({ request }) => {
      chamadas.catalogo += 1
      const kind = new URL(request.url).searchParams.get('kind')
      return HttpResponse.json(kind === 'refining' ? REFINO : CRAFT)
    }),
    http.get('http://localhost:8000/prices/snapshot', () => {
      chamadas.snapshot += 1
      return HttpResponse.json(SNAPSHOT)
    }),
    http.get('http://localhost:8000/prices/sales', () => HttpResponse.json(VENDAS)),
    http.get('http://localhost:8000/me/destiny-board', () => HttpResponse.json({ nodes: {} })),
    http.post('http://localhost:8000/craft/simulate', () => {
      chamadas.simular += 1
      return new HttpResponse(null, { status: 500 })
    }),
  )
})

afterEach(() => localStorage.clear())

function abrir(url: string) {
  return renderWithProviders(
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/calculadora" element={<CalculadoraPage />} />
      </Route>
    </Routes>,
    { initialEntries: [url] },
  )
}

async function cidadesNaOrdem() {
  const tabela = await screen.findByRole('table', { name: 'Lucro por cidade' }, { timeout: 4000 })
  return within(tabela)
    .getAllByRole('button', { name: /Lymhurst|Fort Sterling/ })
    .map((botao) => botao.textContent?.trim())
}

describe('Calculadora sobre o engine (task 14)', () => {
  test('sem item, pede o item — e não busca preço de nada', async () => {
    abrir('/calculadora')

    expect(await screen.findByText(/Escolha um item/)).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /Item/ })).toBeInTheDocument()
    expect(chamadas.snapshot).toBe(0)
  })

  test('com ?item=, mostra as cidades lado a lado, na ordem do lucro', async () => {
    // O link do Market Flip e o "Abrir Calculadora" do systray abrem assim.
    abrir('/calculadora?item=T4_MAIN_SWORD&qty=10')

    await waitFor(async () => expect(await cidadesNaOrdem()).toEqual(['Fort Sterling', 'Lymhurst']))
    // O detalhe abre na melhor cidade. (Dentro da tabela: os chips de Vender em também são
    // botões com o nome da cidade.)
    const tabela = screen.getByRole('table', { name: 'Lucro por cidade' })
    expect(within(tabela).getByRole('button', { name: 'Fort Sterling' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  test('mudar a quantidade recalcula na hora, SEM requisição nova', async () => {
    const user = userEvent.setup()
    abrir('/calculadora?item=T4_MAIN_SWORD&qty=10')
    await waitFor(async () => expect(await cidadesNaOrdem()).toHaveLength(2))

    const tabela = screen.getByRole('table', { name: 'Lucro por cidade' })
    const antes = tabela.textContent
    const pedidos = { ...chamadas }

    const campo = screen.getByRole('textbox', { name: /Receitas a fazer/ })
    await user.clear(campo)
    await user.type(campo, '20')

    await waitFor(() => expect(tabela.textContent).not.toBe(antes))
    expect(chamadas).toEqual(pedidos)
  })

  test('quantidade inválida diz o quê, no campo (corrige E05)', async () => {
    abrir('/calculadora?item=T4_MAIN_SWORD&qty=0')

    const campo = await screen.findByRole('textbox', { name: /Receitas a fazer/ })
    expect(campo).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText(/inteiro a partir de 1/)).toBeInTheDocument()
  })
})
