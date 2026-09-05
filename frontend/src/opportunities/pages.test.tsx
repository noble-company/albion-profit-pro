import { http, HttpResponse, delay } from 'msw'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { renderWithProviders } from '@/test/render'
import { server } from '@/test/msw/server'

import { MarketFlipPage } from './pages'

const LOCATIONS = [
  {
    location_id: '3008',
    name: 'Martlock',
    display_name: 'Martlock',
    kind: 'city',
    is_royal_city: true,
  },
  {
    location_id: '3005',
    name: 'Caerleon',
    display_name: 'Caerleon',
    kind: 'city',
    is_royal_city: true,
  },
]

// Payload no formato do contrato novo (task 04): faturamento bruto, taxas totais, etc.
function flip(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'flip',
    item: 'T4_BAG',
    item_name: 'Bolsa',
    quality_level: 1,
    buy_location: '3008',
    sell_location: '3005',
    buy_price: '1200',
    sell_price: '2000',
    quantity: 5,
    total_cost: '6000',
    gross_revenue: '10000',
    sales_tax: '400',
    total_fees: '400',
    profit: '3600',
    roi: '60',
    oldest_observed_at: new Date().toISOString(),
    warnings: [],
    ...overrides,
  }
}

function mockFlips(handler: Parameters<typeof http.get>[1]) {
  server.use(
    http.get('http://localhost:8000/locations', () =>
      HttpResponse.json(LOCATIONS),
    ),
    http.get('http://localhost:8000/items/categories', () =>
      HttpResponse.json([]),
    ),
    http.get('http://localhost:8000/opportunities/flips', handler),
  )
}

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('albion-profit-pro:realm', 'west')
})

test('renderiza a rota, o lucro, o ROI e as colunas de reconciliação', async () => {
  mockFlips(() =>
    HttpResponse.json({
      server: 'west',
      kind: 'flip',
      opportunities: [flip()],
      total: 1,
      limit: 25,
      offset: 0,
    }),
  )

  renderWithProviders(<MarketFlipPage />)

  const row = (await screen.findByText('Bolsa T4')).closest('tr')!
  expect(within(row).getByText('Martlock')).toBeInTheDocument()
  expect(within(row).getByText('Caerleon')).toBeInTheDocument()
  // colunas de dinheiro visíveis pra conferir faturamento - taxas - investimento = lucro
  expect(within(row).getByText('6.000 silver')).toBeInTheDocument() // investimento
  expect(within(row).getByText('10.000 silver')).toBeInTheDocument() // faturamento
  expect(within(row).getByText('3.600 silver')).toBeInTheDocument() // lucro
  expect(within(row).getByText('400 silver')).toBeInTheDocument() // taxas
  expect(within(row).getByText('60,0%')).toBeInTheDocument() // ROI
})

test('mudar um filtro mantém a tabela anterior visível e envia o filtro ao servidor', async () => {
  const user = userEvent.setup()
  const requested: string[] = []
  mockFlips(async ({ request }) => {
    const url = new URL(request.url)
    requested.push(url.search)
    const label = url.searchParams.get('tier') ? 'Bolsa T5' : 'Bolsa T4'
    await delay(20)
    return HttpResponse.json({
      server: 'west',
      kind: 'flip',
      opportunities: [flip({ item_name: label, item: label })],
      total: 1,
      limit: 25,
      offset: 0,
    })
  })

  renderWithProviders(<MarketFlipPage />)
  expect(await screen.findByText('Bolsa T4')).toBeInTheDocument()

  await user.selectOptions(screen.getByLabelText('Tier'), '5')
  // keepPreviousData: a linha anterior continua na tela enquanto a nova resposta não chega
  expect(screen.getByText('Bolsa T4')).toBeInTheDocument()

  expect(await screen.findByText('Bolsa T5')).toBeInTheDocument()
  expect(requested.some((search) => search.includes('tier=5'))).toBe(true)
  expect(screen.getByLabelText('Tier')).toHaveValue('5')
})

test('estado vazio segue o padrão da task 14 (ausência de dado ≠ lucro zero)', async () => {
  mockFlips(() =>
    HttpResponse.json({
      server: 'west',
      kind: 'flip',
      opportunities: [],
      total: 0,
      limit: 25,
      offset: 0,
    }),
  )

  renderWithProviders(<MarketFlipPage />)

  expect(
    await screen.findByText('Nenhuma oportunidade encontrada'),
  ).toBeInTheDocument()
  expect(
    screen.getByText(/ausência de dados não representa lucro zero/i),
  ).toBeInTheDocument()
})

test('estado de erro mostra o cartão de erro, não uma tabela vazia', async () => {
  mockFlips(() => new HttpResponse(null, { status: 422 }))

  renderWithProviders(<MarketFlipPage />)

  expect(
    await screen.findByText('Não foi possível carregar o Market Flip'),
  ).toBeInTheDocument()
})

test('avisos de confiança aparecem quando o payload os traz', async () => {
  mockFlips(() =>
    HttpResponse.json({
      server: 'west',
      kind: 'flip',
      opportunities: [flip({ warnings: ['dado_velho'] })],
      total: 1,
      limit: 25,
      offset: 0,
    }),
  )

  renderWithProviders(<MarketFlipPage />)

  expect(await screen.findByText('Preço desatualizado')).toBeInTheDocument()
})

test('o selo "Atualização automática" só aparece com a aba visível', async () => {
  mockFlips(() =>
    HttpResponse.json({
      server: 'west',
      kind: 'flip',
      opportunities: [flip()],
      total: 1,
      limit: 25,
      offset: 0,
    }),
  )

  renderWithProviders(<MarketFlipPage />)
  expect(await screen.findByText(/Atualização automática/)).toBeInTheDocument()

  Object.defineProperty(document, 'visibilityState', {
    value: 'hidden',
    configurable: true,
  })
  document.dispatchEvent(new Event('visibilitychange'))

  await waitFor(() =>
    expect(
      screen.queryByText(/Atualização automática/),
    ).not.toBeInTheDocument(),
  )

  Object.defineProperty(document, 'visibilityState', {
    value: 'visible',
    configurable: true,
  })
  document.dispatchEvent(new Event('visibilitychange'))
})
