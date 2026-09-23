import { expect, test } from '@playwright/test'

import { chooseRealm, registerAndLogin } from './helpers'

// Task 3.5/27 — estados de borda contra a stack real.

test('conjunto vazio: filtro sem resultado mostra o estado vazio honesto', async ({
  page,
}) => {
  await registerAndLogin(page)
  await chooseRealm(page, 'West')
  await expect(page.getByRole('heading', { name: 'Market Flip' })).toBeVisible()

  await page.getByLabel('Lucro mínimo').fill('999999999999')

  await expect(
    page.getByText('Nenhuma oportunidade encontrada'),
  ).toBeVisible()
  // a cópia deixa claro que ausência de dado não é lucro zero
  await expect(
    page.getByText(/ausência de dados não representa lucro zero/i),
  ).toBeVisible()
})

test('backend fora do ar: a tela mostra erro, não uma página em branco', async ({
  page,
}) => {
  await registerAndLogin(page)
  await chooseRealm(page, 'West')
  await expect(page.getByRole('heading', { name: 'Market Flip' })).toBeVisible()

  await page.route('**/opportunities/**', (route) => route.abort('failed'))
  await page.reload()

  await expect(
    page.getByText(/Não foi possível carregar o Market Flip/i),
  ).toBeVisible()
})

test('sessão expira no meio da navegação: redireciona pro login com aviso', async ({
  page,
}) => {
  await registerAndLogin(page)
  await chooseRealm(page, 'West')
  await expect(page.getByRole('heading', { name: 'Market Flip' })).toBeVisible()

  // A partir de agora o servidor "não reconhece mais" a sessão.
  await page.route('**/opportunities/**', (route) =>
    route.fulfill({ status: 401, contentType: 'application/json', body: '{"detail":"Unauthorized"}' }),
  )

  await page.goto('/refino')

  await expect(page).toHaveURL(/\/login/)
  await expect(
    page.getByText(/Sua sessão expirou\. Entre novamente para continuar\./i),
  ).toBeVisible()
})
