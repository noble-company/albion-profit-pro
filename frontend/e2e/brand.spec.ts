import { expect, test } from '@playwright/test'

import { registerAndLogin } from './helpers'

test('marca permanece nítida e fixa no login e no shell recolhido', async ({
  page,
}) => {
  await page.goto('/login')
  await expect(
    page.getByRole('img', { name: 'Albion Profit Pro' }),
  ).toBeVisible()

  await registerAndLogin(page)
  const sidebar = page.locator('aside').first()
  const brand = sidebar.getByRole('link', { name: 'Albion Profit Pro' })
  await expect(brand).toBeVisible()
  await expect(brand.locator('img')).toHaveCSS('width', '28px')

  await page.getByRole('combobox', { name: 'Tema' }).click()
  await page.getByRole('option', { name: 'Escuro' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(brand.locator('img')).toBeVisible()

  await sidebar.getByRole('button', { name: 'Colapsar navegação' }).click()
  await expect(
    sidebar.getByRole('button', { name: 'Expandir navegação' }),
  ).toBeVisible()
  await expect(brand).toBeVisible()

  await sidebar.getByRole('combobox', { name: 'Tamanho' }).click()
  await page.getByRole('option', { name: 'Tamanho 220%' }).click()
  await expect(brand.locator('img')).toHaveCSS('width', '28px')
  await expect(page.locator('#conteudo')).toHaveCSS('--escala', '2.2')
})
