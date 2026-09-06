import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'

import { ThemeProvider } from '@/app/ThemeContext'

import { ToastProvider, useToast } from './ToastProvider'

function Emitter() {
  const { toast } = useToast()
  return (
    <button
      type="button"
      onClick={() => {
        toast('primeira notificação')
        toast('segunda notificação')
      }}
    >
      Notificar
    </button>
  )
}

// F10 / task 3.5/25 item 2: o `ToastProvider` é um wrapper fino sobre o `sonner` — fila,
// empilhamento, auto-dismiss e `aria-live` vêm do primitivo. Antes era um
// `useState<string | null>` que a segunda mensagem sobrescrevia.
test('duas notificações seguidas aparecem ambas e somem sozinhas', async () => {
  const user = userEvent.setup()
  render(
    <ThemeProvider>
      <ToastProvider>
        <Emitter />
      </ToastProvider>
    </ThemeProvider>,
  )

  await user.click(screen.getByRole('button', { name: 'Notificar' }))

  expect(await screen.findByText('primeira notificação')).toBeInTheDocument()
  expect(screen.getByText('segunda notificação')).toBeInTheDocument()

  await waitFor(
    () => {
      expect(screen.queryByText('primeira notificação')).not.toBeInTheDocument()
      expect(screen.queryByText('segunda notificação')).not.toBeInTheDocument()
    },
    { timeout: 8000 },
  )
}, 12000)
