import { render, type RenderOptions } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { type PropsWithChildren, type ReactElement } from 'react'
import { MemoryRouter } from 'react-router'

import { createQueryClient } from '@/api/query'
import { AuthProvider } from '@/auth/AuthContext'
import { ServerProvider } from '@/app/ServerContext'
import { ThemeProvider } from '@/app/ThemeContext'
import { ToastProvider } from '@/components/ui/ToastProvider'

function makeProviders(initialEntries: string[]) {
  // Um QueryClient novo por render — o cache de um caso não vaza pro próximo, mesmo dentro
  // do mesmo arquivo (task 3.5/26, item 2). Mantém as políticas de produção (retry só em
  // erro retryável) via createQueryClient.
  const client = createQueryClient()
  return function TestProviders({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={client}>
        <ThemeProvider>
          <ServerProvider>
            <ToastProvider>
              <AuthProvider>
                <MemoryRouter initialEntries={initialEntries}>
                  {children}
                </MemoryRouter>
              </AuthProvider>
            </ToastProvider>
          </ServerProvider>
        </ThemeProvider>
      </QueryClientProvider>
    )
  }
}

export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'> & { initialEntries?: string[] },
) {
  const { initialEntries = ['/'], ...renderOptions } = options ?? {}
  return render(ui, {
    wrapper: makeProviders(initialEntries),
    ...renderOptions,
  })
}
