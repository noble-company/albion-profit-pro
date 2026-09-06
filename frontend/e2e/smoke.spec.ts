import { expect, test } from '@playwright/test'

import { chooseRealm, registerAndLogin } from './helpers'

// Task 3.5/27 — Passo A. O caminho mínimo de ponta a ponta contra a stack real:
// registrar → logar → escolher realm → chegar ao Market Flip com dado semeado
// (backend/scripts/seed_e2e_market.py). Se este teste passa, o pipeline inteiro
// (compose + migrate + seed + API + preview) está de pé.

test('registrar, logar, escolher realm e ver o Market Flip com dado real', async ({
  page,
}) => {
  await registerAndLogin(page)

  // Sem realm escolhido, a tela pede um.
  await expect(
    page.getByRole('heading', { name: 'Escolha um servidor' }),
  ).toBeVisible()

  await chooseRealm(page, 'West')

  // Market Flip renderiza.
  await expect(page.getByText(/Encontre o próximo lucro/i)).toBeVisible()

  // A oportunidade determinística do seed: T4_FIBER_LEVEL3@3, Fort Sterling (4002) →
  // Caerleon (3005), compra 4.000 / venda 5.500, ROI 32%. O nome do item vem do catálogo
  // estático semeado.
  const flipRow = page.getByRole('row', {
    name: /Cânhamo Excepcional.*Fort Sterling.*Caerleon/,
  })
  await expect(flipRow).toBeVisible()
  await expect(flipRow).toContainText('32') // ROI %
})
