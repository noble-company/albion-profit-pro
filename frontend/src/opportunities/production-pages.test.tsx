import { http, HttpResponse } from 'msw'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { renderWithProviders } from '@/test/render'
import { server } from '@/test/msw/server'

import { CraftingRankingPage, RefiningRankingPage } from './production-pages'

const opportunity = {
  kind: 'refining',
  item: 'T4_CLOTH@1',
  item_name: 'Tecido do Adepto',
  quality_level: 3,
  buy_location: '1002',
  sell_location: '1002',
  buy_price: '1200',
  sell_price: '1800',
  quantity: 1,
  total_cost: '1200',
  gross_revenue: '1800',
  profit: '528',
  roi: '44',
  acquisition_mode: 'immediate',
  sale_mode: 'sell_order',
  ingredients: [
    {
      item: 'T4_FIBER',
      item_name: 'Fibra do Adepto',
      gross_quantity: 2,
      expected_return_quantity: '0.7',
      purchase_quantity: 2,
    },
  ],
  station_cost: '72',
  focus_consumed: 100,
  oldest_observed_at: new Date().toISOString(),
  warnings: ['ordem_nao_garantida'],
}

const quote = {
  requested_quantity: 1,
  priced_quantity: 1,
  unit_price: '100',
  total: '100',
  complete: true,
  guaranteed: true,
  source: 'book',
  levels: [],
  warnings: [],
  oldest_observed_at: new Date().toISOString(),
  age_seconds: 1,
}

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('albion-profit-pro:realm', 'west')
})

test('Refino renderiza entradas, retorno calculado, alertas e abre a análise', async () => {
  const user = userEvent.setup()
  let simulationBody: unknown
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
    http.get('http://localhost:8000/opportunities/refining', () =>
      HttpResponse.json({
        server: 'west',
        kind: 'refining',
        opportunities: [opportunity],
        total: 1,
        limit: 25,
        offset: 0,
      }),
    ),
    http.post('http://localhost:8000/craft/simulate', async ({ request }) => {
      simulationBody = await request.json()
      return HttpResponse.json({
        server: 'west',
        output_item: 'T4_CLOTH@1',
        location_id: '1002',
        output_quality: 3,
        scope: 'all',
        requested_quantity: 1,
        executions: 1,
        produced_quantity: 1,
        surplus_quantity: 0,
        return_rate: '0',
        focus_consumed: 0,
        premium: true,
        sales_tax_rate: '0.04',
        setup_fee_rate: '0.025',
        recipe: {
          silver_cost_per_execution: 0,
          crafting_focus_per_execution: 100,
          amount_crafted: 1,
        },
        ingredients: [
          {
            position: 0,
            unique_name: 'T4_FIBER',
            quality_level: 1,
            count_per_execution: 2,
            return_eligible: true,
            gross_quantity: 2,
            expected_return_quantity: '0.7',
            effective_quantity: '1.3',
            purchase_quantity: 2,
            immediate_purchase: quote,
            buy_order: quote,
          },
        ],
        output_quotes: { immediate_sale: quote, sell_order: quote },
        scenarios: [
          {
            acquisition_mode: 'immediate',
            sale_mode: 'sell_order',
            costs: {
              ingredient_cost: '1200',
              recipe_silver_cost: '0',
              station_cost: '72',
              upgrade_cost: '0',
              acquisition_setup_fee: '0',
              total_cost: '1272',
            },
            revenue: {
              gross_revenue: '1800',
              sales_tax: '72',
              sale_setup_fee: '45',
              net_revenue: '1683',
            },
            profit: '411',
            profit_per_unit: '411',
            roi: '32.3',
            warnings: ['ordem_nao_garantida'],
          },
        ],
      })
    }),
  )

  renderWithProviders(<RefiningRankingPage />)

  expect(
    await screen.findByRole('heading', { name: 'O que vale a pena refinar' }),
  ).toBeInTheDocument()
  expect(await screen.findByText('Tecido T4.1')).toBeInTheDocument()
  // A coluna "Receita" junta ingrediente + retorno esperado numa linha só.
  const receita = screen.getByRole('listitem')
  expect(receita.textContent?.replace(/\s+/g, ' ').trim()).toBe(
    'Fibra T4 ×2 · retorno 0,7',
  )
  expect(screen.getByText('Ordem não garantida')).toBeInTheDocument()
  expect(screen.getByText('72 silver')).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Analisar' }))
  const dialog = await screen.findByRole('dialog', {
    name: 'Análise detalhada',
  })
  expect(dialog).toBeInTheDocument()
  expect(
    within(dialog).getByText('Imediato → Pedido de venda'),
  ).toBeInTheDocument()
  expect(
    screen.getByRole('link', { name: 'Abrir na calculadora' }),
  ).toHaveAttribute('href', '/calculadora?item=T4_CLOTH%401')
  expect(simulationBody).toMatchObject({
    server: 'west',
    output_item: 'T4_CLOTH@1',
    location_id: '1002',
    output_quality: 3,
  })
})

test('Craft diferencia ausência de oportunidade de lucro zero', async () => {
  server.use(
    http.get('http://localhost:8000/locations', () => HttpResponse.json([])),
    http.get('http://localhost:8000/opportunities/crafting', () =>
      HttpResponse.json({
        server: 'west',
        kind: 'crafting',
        opportunities: [],
        total: 0,
        limit: 25,
        offset: 0,
      }),
    ),
  )

  renderWithProviders(<CraftingRankingPage />)

  expect(
    await screen.findByRole('heading', { name: 'O que vale a pena fabricar' }),
  ).toBeInTheDocument()
  expect(
    await screen.findByText('Nenhuma oportunidade encontrada'),
  ).toBeInTheDocument()
  expect(screen.getByText(/Isso não representa lucro zero/)).toBeInTheDocument()
})

test('receita fora das 200 primeiras em ordem alfabética aparece no ranking (B02)', async () => {
  // O servidor ordena por lucro sobre o universo completo (task 03 + 17). Um item que
  // começa com "Z" — que a antiga heurística truncava — vem em primeiro se for o mais
  // lucrativo.
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
    http.get('http://localhost:8000/opportunities/refining', () =>
      HttpResponse.json({
        server: 'west',
        kind: 'refining',
        opportunities: [
          {
            ...opportunity,
            item: 'T8_METALBAR',
            item_name: 'Zinco',
            profit: '90000',
          },
        ],
        total: 5623,
        limit: 25,
        offset: 0,
        coverage: {
          evaluated_recipes: 5600,
          priced_recipes: 4100,
          total_recipes: 5623,
          computed_at: new Date().toISOString(),
          stale: false,
        },
      }),
    ),
  )

  renderWithProviders(<RefiningRankingPage />)

  expect(await screen.findByText('Zinco T8')).toBeInTheDocument()
  // cobertura do ranking exibida quando o payload a traz (item 2)
  expect(
    screen.getByText(/4\.100 receitas com preço · 5\.600 avaliadas de 5\.623/),
  ).toBeInTheDocument()
  expect(screen.getByText(/projeção sobre o ranking/)).toBeInTheDocument()
})

test('"Analisar" envia a qualidade do filtro ativo, não um valor fixo (item 5)', async () => {
  const user = userEvent.setup()
  let simulationBody: Record<string, unknown> | undefined
  server.use(
    http.get('http://localhost:8000/locations', () => HttpResponse.json([])),
    http.get('http://localhost:8000/opportunities/refining', () =>
      HttpResponse.json({
        server: 'west',
        kind: 'refining',
        opportunities: [opportunity],
        total: 1,
        limit: 25,
        offset: 0,
      }),
    ),
    http.post('http://localhost:8000/craft/simulate', async ({ request }) => {
      simulationBody = (await request.json()) as Record<string, unknown>
      return new HttpResponse(null, { status: 200 })
    }),
  )

  renderWithProviders(<RefiningRankingPage />)
  await screen.findByText('Tecido T4.1')

  await user.selectOptions(screen.getByLabelText('Qualidade'), '5')
  await user.click(screen.getByRole('button', { name: 'Analisar' }))

  await new Promise((resolve) => setTimeout(resolve, 20))
  expect(simulationBody?.output_quality).toBe(5)
})

test('trocar de Refino para Craft preserva os filtros da URL (item 6)', async () => {
  const user = userEvent.setup()
  server.use(
    http.get('http://localhost:8000/locations', () => HttpResponse.json([])),
    http.get('http://localhost:8000/opportunities/refining', () =>
      HttpResponse.json({
        server: 'west',
        kind: 'refining',
        opportunities: [opportunity],
        total: 1,
        limit: 25,
        offset: 0,
      }),
    ),
  )

  renderWithProviders(<RefiningRankingPage />)
  await screen.findByText('Tecido T4.1')

  await user.selectOptions(screen.getByLabelText('Tier'), '6')

  const craftTab = screen.getByRole('tab', { name: 'Craft' })
  expect(craftTab.getAttribute('href')).toContain('tier=6')
})

// --- Camada "e se" no cliente (task 23) ---

// components: ingredientes 6000 imediato (sem ordem), venda bruta 10000 imediato, receita
// 12×4, 4 produzidos. Projeção premium/retorno-0: imposto 400 → lucro 3552. Premium off:
// imposto 800 → lucro 3152. Retorno 50%: ingrediente cai pra 3000 → lucro 6552.
const rankingRow = {
  kind: 'refining',
  item: 'T4_METALBAR',
  item_name: 'Barra',
  quality_level: 1,
  buy_location: '1002',
  sell_location: '1002',
  quantity: 4,
  price_model: 'neutral_ranking',
  total_cost: '6048',
  gross_revenue: '10000',
  profit: '3552',
  roi: '58.7301',
  acquisition_mode: 'immediate',
  sale_mode: 'immediate',
  station_cost: '0',
  ingredients: [],
  warnings: [],
  components: {
    recipe_silver_cost: 12,
    crafting_focus: 180,
    executions: 4,
    produced_quantity: 4,
    ingredient_cost_immediate: '6000',
    ingredient_cost_order: null,
    output_gross_immediate: '10000',
    output_gross_order: null,
    ingredients_oldest_observed_at: '2026-09-01T09:30:00+00:00',
    output_immediate_observed_at: '2026-09-01T12:00:00+00:00',
    output_order_observed_at: null,
  },
}

function mockRanking() {
  let requests = 0
  server.use(
    http.get('http://localhost:8000/locations', () => HttpResponse.json([])),
    http.get('http://localhost:8000/opportunities/refining', () => {
      requests += 1
      return HttpResponse.json({
        server: 'west',
        kind: 'refining',
        opportunities: [rankingRow],
        total: 1,
        limit: 25,
        offset: 0,
        coverage: {
          evaluated_recipes: 10,
          priced_recipes: 8,
          total_recipes: 12,
          computed_at: new Date().toISOString(),
          stale: false,
        },
      })
    }),
  )
  return () => requests
}

test('mexer em Premium recalcula os valores no cliente sem nova requisição (task 23)', async () => {
  const user = userEvent.setup()
  const requestCount = mockRanking()

  renderWithProviders(<RefiningRankingPage />)
  const row = (await screen.findByText('Barra T4')).closest('tr')!
  expect(within(row).getByText('3.552 silver')).toBeInTheDocument() // lucro projetado (premium)
  const afterInitial = requestCount()

  await user.click(screen.getByRole('switch', { name: /Conta Premium/ }))
  // premium off → imposto 8% → lucro 3.152; o número muda na hora, sem request
  await waitFor(() =>
    expect(within(row).getByText('3.152 silver')).toBeInTheDocument(),
  )
  expect(requestCount()).toBe(afterInitial)
})

test('mexer no retorno recalcula sem request e a linha não some (só muda de valor)', async () => {
  const user = userEvent.setup()
  const requestCount = mockRanking()

  renderWithProviders(<RefiningRankingPage />)
  const row = (await screen.findByText('Barra T4')).closest('tr')!
  const afterInitial = requestCount()

  const retorno = screen.getByLabelText('Retorno de recurso (%)')
  await user.clear(retorno)
  await user.type(retorno, '50')
  await waitFor(() =>
    expect(within(row).getByText('6.552 silver')).toBeInTheDocument(),
  )
  expect(requestCount()).toBe(afterInitial)
})
