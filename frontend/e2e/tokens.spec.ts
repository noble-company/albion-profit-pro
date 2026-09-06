import { expect, test } from '@playwright/test'

import { registerAndLogin } from './helpers'

// Task 3.5/27 — criar e revogar um token do client Go pela UI real.

test('criar e revogar um token de API', async ({ page }) => {
  await registerAndLogin(page)
  await page.goto('/tokens')
  await expect(page.getByRole('heading', { name: 'Tokens de API' })).toBeVisible()
  await expect(page.getByText('Nenhum token ativo')).toBeVisible()

  await page.getByRole('button', { name: 'Gerar token' }).click()

  // O modal mostra o segredo uma vez e trava até copiar.
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Token criado — copie agora')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Copiei e fechar' })).toBeDisabled()

  await dialog.getByRole('button', { name: 'Copiar segredo' }).click()
  await expect(dialog.getByRole('button', { name: 'Copiado' })).toBeVisible()
  await dialog.getByRole('button', { name: 'Copiei e fechar' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // O token aparece na lista de ativos.
  const tokenRow = page.getByRole('listitem').filter({ hasText: 'Token' })
  await expect(tokenRow).toHaveCount(1)

  await tokenRow.getByRole('button', { name: 'Revogar' }).click()
  await expect(page.getByText('Nenhum token ativo')).toBeVisible()
})
