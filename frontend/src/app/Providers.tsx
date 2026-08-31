import { QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'

import { queryClient } from '@/api/query'
import { AuthProvider } from '@/auth/AuthContext'
import { ServerProvider } from './ServerContext'
import { ThemeProvider } from './ThemeContext'
import { ToastProvider } from '@/components/ui/ToastProvider'

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ServerProvider>
          <ToastProvider>
            <AuthProvider>{children}</AuthProvider>
          </ToastProvider>
        </ServerProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
