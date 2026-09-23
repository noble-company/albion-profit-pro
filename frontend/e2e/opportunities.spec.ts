import { expect, test, type Page } from '@playwright/test'

import { chooseRealm, registerAndLogin } from './helpers'

test.beforeEach(async ({ page }) => {
  await registerAndLogin(page)
  await chooseRealm(page, 'West')
})

function offersFound(page: Page) {
  return page.locator('header').getByText(/oportunidades · página/)
}

async function totalOffers(page: Page): Promise<number> {
  const text = await offersFound(page).innerText()
  return Number(
    text.match(/([\d.]+) oportunidades/)?.[1]?.replaceAll('.', '') ?? 0,
  )
}

test('filtrar por tier reduz o conjunto e limpar restaura', async ({
  page,
}) => {
  await expect(page.getByRole('heading', { name: 'Market Flip' })).toBeVisible()
  await expect(offersFound(page)).toContainText('oportunidades')
  const inicial = await totalOffers(page)
  expect(inicial).toBeGreaterThanOrEqual(25)

  await page
    .getByRole('group', { name: 'Tier' })
    .getByRole('button', { name: 'T5' })
    .click()
  await expect(offersFound(page)).toContainText('5 oportunidades')
  expect(await page.locator('tbody tr').count()).toBe(5)

  await page.getByRole('button', { name: 'Limpar filtros' }).click()
  await expect(offersFound(page)).toContainText(`${inicial} oportunidades`)
})

test('combina cidades independentes e múltiplos tiers no contrato novo', async ({
  page,
}) => {
  await page
    .getByRole('group', { name: 'Comprar em' })
    .getByRole('button', { name: 'Martlock' })
    .click()
  await page
    .getByRole('group', { name: 'Vender em' })
    .getByRole('button', { name: 'Caerleon' })
    .click()
  await page
    .getByRole('group', { name: 'Tier' })
    .getByRole('button', { name: 'T4' })
    .click()

  const responsePromise = page.waitForResponse((response) => {
    if (!response.url().includes('/opportunities/flips')) return false
    const params = new URL(response.url()).searchParams
    return (
      params.getAll('buy_location_id').includes('3008') &&
      params.getAll('sell_location_id').includes('3005') &&
      params.getAll('tier').includes('4') &&
      params.getAll('tier').includes('5')
    )
  })
  await page
    .getByRole('group', { name: 'Tier' })
    .getByRole('button', { name: 'T5' })
    .click()
  expect((await responsePromise).status()).toBe(200)

  const params = new URL(page.url()).searchParams
  expect(params.getAll('buy_in')).toEqual(['3008'])
  expect(params.getAll('sell_in')).toEqual(['3005'])
  expect(params.getAll('tier')).toEqual(['4', '5'])
})

test('paginar mantém a ordenação estável entre páginas (F08)', async ({
  page,
}) => {
  // chave estável de cada linha: a 1ª célula (item + tier)
  const rowKeys = async () =>
    page.locator('tbody tr td:first-child').allInnerTexts()

  const flipResponse = (predicate: (url: URL) => boolean) =>
    page.waitForResponse((r) => {
      if (!r.url().includes('/opportunities/flips') || r.status() !== 200)
        return false
      return predicate(new URL(r.url()))
    })

  await Promise.all([
    flipResponse(
      (u) =>
        u.searchParams.get('sort') === 'roi' &&
        (u.searchParams.get('offset') ?? '0') === '0',
    ),
    page.getByRole('button', { name: /^ROI/ }).click(),
  ])
  const total = await totalOffers(page)
  expect(total).toBeGreaterThan(25)
  const rest = total - 25

  await expect(page.locator('tbody tr')).toHaveCount(25)
  const page1 = await rowKeys()

  await Promise.all([
    flipResponse((u) => u.searchParams.get('offset') === '25'),
    page.getByRole('button', { name: 'Próxima' }).click(),
  ])
  await expect(page.getByText(/Página 2/)).toBeVisible()
  await expect(page.locator('tbody tr')).toHaveCount(rest)
  const page2 = await rowKeys()

  // nenhuma linha nas duas páginas = ordenação total e estável no servidor (F08)
  expect(page1.filter((key) => page2.includes(key))).toEqual([])

  await page.getByRole('button', { name: 'Anterior' }).click()
  await expect(page.getByText(/Página 1/)).toBeVisible()
  await expect(page.locator('tbody tr')).toHaveCount(25)
  expect(await rowKeys()).toEqual(page1)
})

test('mudar premium/retorno no Refino não dispara requisição ao servidor (task 23)', async ({
  page,
}) => {
  await page.goto('/refino')
  await expect(page.getByText(/O que vale a pena refinar/i)).toBeVisible()
  await expect(page.getByRole('row', { name: /Tecido Fino/ })).toBeVisible()

  let rankingCalls = 0
  page.on('request', (req) => {
    if (req.url().includes('/opportunities/refining')) rankingCalls += 1
  })

  await page.getByLabel('Conta Premium').click()
  await page.getByLabel(/Retorno de recurso/i).fill('25')
  await page.waitForTimeout(800)

  expect(rankingCalls).toBe(0)
  await expect(page.getByRole('row', { name: /Tecido Fino/ })).toBeVisible()
})

test('abrir o detalhe de uma oportunidade mostra os quatro cenários', async ({
  page,
}) => {
  await page.goto('/refino')
  await expect(page.getByText(/O que vale a pena refinar/i)).toBeVisible()

  await page
    .getByRole('row', { name: /Tecido Fino/ })
    .getByRole('button', { name: 'Analisar' })
    .click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText(/Análise detalhada/i)).toBeVisible()

  // quatro combinações aquisição × venda (2 com aquisição imediata, 2 com venda imediata)
  await expect(dialog.getByText(/Imediato →/)).toHaveCount(2)
  await expect(dialog.getByText(/→ Imediato/)).toHaveCount(2)

  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
