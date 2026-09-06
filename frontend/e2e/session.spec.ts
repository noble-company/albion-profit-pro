import { expect, test } from '@playwright/test'

import { chooseRealm, registerAndLogin } from './helpers'

// Task 3.5/27 — regressão de F07 no ambiente real. O bug era: recarregar a página
// deslogava, porque a sessão só vivia em memória. A task 16 restaura a sessão da aba a
// partir do sessionStorage. Este teste falha de forma verificável se a task 16 for
// revertida (o reload cairia em /login).

test('recarregar autenticado continua logado', async ({ page }) => {
  await registerAndLogin(page)
  await chooseRealm(page, 'West')
  await expect(page.getByText(/Encontre o próximo lucro/i)).toBeVisible()

  await page.reload()

  // Continua na Market Flip, não foi jogado pro login.
  await expect(page).toHaveURL(/\/(?:$|\?)/)
  await expect(page.getByText(/Encontre o próximo lucro/i)).toBeVisible()
  await expect(page).not.toHaveURL(/\/login/)

  // E uma navegação direta pra rota protegida também sobrevive ao reload.
  await page.goto('/tokens')
  await expect(page.getByRole('heading', { name: /Tokens de API/i })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: /Tokens de API/i })).toBeVisible()
})
