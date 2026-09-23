import { expect, test } from '@playwright/test'

import { chooseRealm, registerAndLogin } from './helpers'

const API_BASE_URL = process.env.E2E_API_BASE_URL ?? 'http://127.0.0.1:8000'

test('salvar no backend, acompanhar e remover em Meus Crafts', async ({ page }) => {
  await registerAndLogin(page)
  await chooseRealm(page, 'West')

  const status = await page.evaluate(async (apiBaseUrl) => {
    const token = sessionStorage.getItem('albion-profit-pro.access-token')
    const response = await fetch(`${apiBaseUrl}/me/saved-crafts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        server: 'west',
        output_item: 'T4_MAIN_SWORD',
        quantity: 12,
        output_quality: 2,
      }),
    })
    return response.status
  }, API_BASE_URL)
  expect(status).toBe(201)

  await page.getByRole('link', { name: 'Meus Crafts' }).click()
  await expect(page.getByRole('heading', { name: 'Meus Crafts' })).toBeVisible()
  await expect(page.getByText(/1 crafts salvos/)).toBeVisible()
  await expect(page.getByText('12 receitas')).toBeVisible()

  await page.getByRole('button', { name: /Remover/ }).click()
  await page.getByRole('button', { name: 'Confirmar' }).click()
  await expect(page.getByText('Sua bancada ainda está vazia')).toBeVisible()

  await page.reload()
  await expect(page.getByText('Sua bancada ainda está vazia')).toBeVisible()
})
