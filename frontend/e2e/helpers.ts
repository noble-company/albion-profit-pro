import { expect, type Page } from '@playwright/test'

/**
 * Um e-mail novo por execução — o registro é irreversível e a stack não é derrubada entre
 * rodadas locais. Domínio real (o validador de e-mail do backend rejeita `.test`/`.local`).
 */
export function uniqueEmail(): string {
  const stamp = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 8)
  return `e2e-${stamp}-${rand}@albion-profit-e2e.com`
}

export const PASSWORD = 'e2e-passphrase-1234'

/** Registra e faz login pela própria UI, terminando autenticado em `/`. */
export async function registerAndLogin(
  page: Page,
  email = uniqueEmail(),
): Promise<{ email: string }> {
  await page.goto('/register')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirmar senha').fill(PASSWORD)
  await page.getByRole('button', { name: 'Criar conta' }).click()

  // O registro redireciona pra /login.
  await expect(page).toHaveURL(/\/login/)
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Entrar' }).click()

  await expect(page).toHaveURL(/\/(?:$|\?)/)
  return { email }
}

/** Escolhe o realm pelo Select do cabeçalho (Radix). */
export async function chooseRealm(
  page: Page,
  realm: 'West' | 'East' | 'Europa' = 'West',
): Promise<void> {
  await page.getByRole('combobox', { name: 'Servidor' }).click()
  await page.getByRole('option', { name: realm }).click()
}
