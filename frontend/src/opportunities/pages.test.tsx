import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse, delay } from 'msw'
import { Route, Routes, useLocation } from 'react-router'

import { AppShell } from '@/components/AppShell'
import { server } from '@/test/msw/server'
import { renderWithProviders } from '@/test/render'

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

function page(opportunities = [flip()], total = opportunities.length) {
  return {
    server: 'west',
    kind: 'flip',
    opportunities,
    total,
    limit: 25,
    offset: 0,
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

function renderMarketFlip(initialEntries = ['/']) {
  return renderWithProviders(
    <Routes>
      <Route element={<AppShell />}>
        <Route
          path="*"
          element={
            <>
              <MarketFlipPage />
              <LocationProbe />
            </>
          }
        />
      </Route>
    </Routes>,
    { initialEntries },
  )
}

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location-search">{location.search}</output>
}

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('albion-profit-pro:realm', 'west')
})

test('renderiza item, rota e todas as colunas de reconciliação', async () => {
  mockFlips(() => HttpResponse.json(page()))
  renderMarketFlip()

  const row = (await screen.findByText('Bolsa')).closest('tr')!
  expect(within(row).getByText('T4 · Normal')).toBeInTheDocument()
  expect(within(row).getByText('Martlock')).toBeInTheDocument()
  expect(within(row).getByText('Caerleon')).toBeInTheDocument()
  expect(within(row).getByText('6.000 silver')).toBeInTheDocument()
  expect(within(row).getByText('10.000 silver')).toBeInTheDocument()
  expect(within(row).getByText('3.600 silver')).toBeInTheDocument()
  expect(within(row).getByText('400 silver')).toBeInTheDocument()
  expect(within(row).getByText('60,0%')).toBeInTheDocument()
  expect(row.querySelector('img[src*="T4_BAG"]')).toBeInTheDocument()
})

test('mudar um filtro mantém a tabela anterior e envia o filtro ao servidor', async () => {
  const user = userEvent.setup()
  const requested: string[] = []
  mockFlips(async ({ request }) => {
    const url = new URL(request.url)
    requested.push(url.search)
    const tier = url.searchParams.getAll('tier').at(-1) ?? '4'
    await delay(20)
    return HttpResponse.json(
      page([flip({ item_name: `Bolsa ${tier}`, item: `T${tier}_BAG` })]),
    )
  })

  renderMarketFlip()
  expect(await screen.findByText('Bolsa 4')).toBeInTheDocument()
  await user.click(
    within(screen.getByRole('group', { name: 'Tier' })).getByRole('button', {
      name: 'T5',
    }),
  )
  expect(screen.getByText('Bolsa 4')).toBeInTheDocument()
  expect(await screen.findByText('Bolsa 5')).toBeInTheDocument()
  expect(requested.some((search) => search.includes('tier=5'))).toBe(true)
})

test('Comprar em e Vender em escrevem listas independentes na URL', async () => {
  const user = userEvent.setup()
  const requested: string[] = []
  mockFlips(({ request }) => {
    requested.push(new URL(request.url).search)
    return HttpResponse.json(page())
  })
  renderMarketFlip()
  await screen.findByText('Bolsa')

  await user.click(
    within(screen.getByRole('group', { name: 'Comprar em' })).getByRole(
      'button',
      {
        name: 'Martlock',
      },
    ),
  )
  await waitFor(() =>
    expect(
      requested.some((search) => search.includes('buy_location_id=3008')),
    ).toBe(true),
  )
  await user.click(
    within(screen.getByRole('group', { name: 'Vender em' })).getByRole(
      'button',
      {
        name: 'Caerleon',
      },
    ),
  )
  await waitFor(() =>
    expect(
      requested.some((search) => search.includes('sell_location_id=3005')),
    ).toBe(true),
  )
})

test('estado vazio explica que ausência de dado não é lucro zero', async () => {
  mockFlips(() => HttpResponse.json(page([], 0)))
  renderMarketFlip()
  expect(
    await screen.findByText('Nenhuma oportunidade encontrada'),
  ).toBeInTheDocument()
  expect(
    screen.getByText(/ausência de dados não representa lucro zero/i),
  ).toBeInTheDocument()
})

test('estado de erro mostra o cartão de erro, não uma tabela vazia', async () => {
  mockFlips(() => new HttpResponse(null, { status: 422 }))
  renderMarketFlip()
  expect(
    await screen.findByText('Não foi possível carregar o Market Flip'),
  ).toBeInTheDocument()
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
})

test('avisos de confiança ficam acessíveis na célula compacta', async () => {
  mockFlips(() => HttpResponse.json(page([flip({ warnings: ['stale_data'] })])))
  renderMarketFlip()
  const warning = await screen.findByText('Preço desatualizado')
  expect(warning).toHaveClass('sr-only')
  expect(warning.closest('tr')).toContainElement(screen.getByText('Bolsa'))
})

test('o estado de atualização só aparece com a aba visível', async () => {
  mockFlips(() => HttpResponse.json(page()))
  renderMarketFlip()
  expect(await screen.findByText(/atualização a cada 30 s/)).toBeInTheDocument()

  Object.defineProperty(document, 'visibilityState', {
    value: 'hidden',
    configurable: true,
  })
  document.dispatchEvent(new Event('visibilitychange'))
  await waitFor(() =>
    expect(
      screen.queryByText(/atualização a cada 30 s/),
    ).not.toBeInTheDocument(),
  )

  Object.defineProperty(document, 'visibilityState', {
    value: 'visible',
    configurable: true,
  })
  document.dispatchEvent(new Event('visibilitychange'))
})

test('Lucro, ROI e Idade ordenam o conjunto inteiro pelo servidor', async () => {
  const user = userEvent.setup()
  const requests: string[] = []
  mockFlips(({ request }) => {
    requests.push(new URL(request.url).search)
    return HttpResponse.json(page())
  })
  renderMarketFlip()
  await screen.findByText('Bolsa')

  await user.click(screen.getByRole('button', { name: /Lucro/ }))
  await waitFor(() =>
    expect(requests.some((value) => value.includes('direction=asc'))).toBe(
      true,
    ),
  )
  await user.click(screen.getByRole('button', { name: /ROI/ }))
  await waitFor(() =>
    expect(requests.some((value) => value.includes('sort=roi'))).toBe(true),
  )
  await user.click(screen.getByRole('button', { name: /Idade/ }))
  await waitFor(() =>
    expect(requests.some((value) => value.includes('sort=freshness'))).toBe(
      true,
    ),
  )
})

test('a idade exibida pertence a cada linha', async () => {
  const now = Date.now()
  mockFlips(() =>
    HttpResponse.json(
      page([
        flip({
          item: 'T4_BAG',
          item_name: 'Bolsa curta',
          oldest_observed_at: new Date(now - 10 * 60_000).toISOString(),
        }),
        flip({
          item: 'T5_BAG',
          item_name: 'Bolsa antiga',
          oldest_observed_at: new Date(now - 2 * 60 * 60_000).toISOString(),
        }),
      ]),
    ),
  )
  renderMarketFlip()
  const recent = (await screen.findByText('Bolsa curta')).closest('tr')!
  const old = screen.getByText('Bolsa antiga').closest('tr')!
  expect(within(recent).getByText(/há 10 min|há 9 min/)).toBeInTheDocument()
  expect(within(old).getByText(/há 2 h|há 1 h/)).toBeInTheDocument()
})

test('busca espera a pausa, exige três letras e limpar remove o filtro na hora', async () => {
  const user = userEvent.setup()
  const requestedItems: Array<string | null> = []
  mockFlips(({ request }) => {
    requestedItems.push(new URL(request.url).searchParams.get('item_id'))
    return HttpResponse.json(page())
  })
  renderMarketFlip()
  await screen.findByText('Bolsa')
  const search = screen.getByRole('searchbox', { name: 'Buscar item' })

  await user.type(search, 'bo')
  await delay(350)
  expect(requestedItems).toEqual([null])

  await user.type(search, 'lsa')
  await waitFor(() => expect(requestedItems).toContain('bolsa'))
  expect(requestedItems.filter((value) => value === 'bolsa')).toHaveLength(1)

  await user.click(screen.getByRole('button', { name: 'Limpar busca' }))
  await waitFor(() =>
    expect(screen.getByTestId('location-search')).not.toHaveTextContent(
      'item_id',
    ),
  )
})
