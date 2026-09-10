import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { MemoryRouter } from 'react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { expect, test } from 'vitest'

import { queryClient } from '@/api/query'
import type { Opportunity } from '@/opportunities/service'

import { DetailDrawer } from './DetailDrawer'

const row: Opportunity = {
  // `flip` é o único `kind` que sobrou: os de produção saíram com o ranking (task 4/15).
  kind: 'flip',
  item: 'T4_CLOTH',
  item_name: 'Pano',
  quality_level: 1,
  buy_location: '1002',
  quantity: 1,
}

function Harness() {
  const [open, setOpen] = useState(false)
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <button type="button" onClick={() => setOpen(true)}>
          Analisar
        </button>
        <DetailDrawer
          row={row}
          result={null}
          loading={false}
          error={null}
          open={open}
          onOpenChange={setOpen}
        />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

// A restauração de foco ao gatilho ao fechar é garantia do Radix (`onCloseAutoFocus`) e é
// verificada com leitor de tela no navegador — o jsdom não modela esse passo de forma
// confiável. Aqui cobre-se o que o jsdom modela: foco entra, `Esc` fecha, foco não escapa.
test('abrir move o foco pra dentro do diálogo e Esc fecha', async () => {
  const user = userEvent.setup()
  render(<Harness />)

  const trigger = screen.getByRole('button', { name: 'Analisar' })
  trigger.focus()
  await user.click(trigger)

  const dialog = await screen.findByRole('dialog', { name: /Pano T4/ })
  await waitFor(() =>
    expect(dialog).toContainElement(
      document.activeElement as HTMLElement | null,
    ),
  )

  await user.keyboard('{Escape}')
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  )
})

test('Tab não escapa do diálogo (foco preso)', async () => {
  const user = userEvent.setup()
  render(<Harness />)

  await user.click(screen.getByRole('button', { name: 'Analisar' }))
  const dialog = await screen.findByRole('dialog', { name: /Pano T4/ })

  for (let i = 0; i < 8; i += 1) {
    await user.tab()
    expect(dialog).toContainElement(
      document.activeElement as HTMLElement | null,
    )
  }
})
