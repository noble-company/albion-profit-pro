import type { PropsWithChildren } from 'react'
import { toast as sonnerToast } from 'sonner'

import { Toaster } from '@/components/ui/sonner'

/**
 * Wrapper fino sobre o `sonner`. Mantém a API `useToast().toast(mensagem)` que o resto do
 * app já usa; a fila, o empilhamento e a acessibilidade vêm do primitivo.
 */
export function ToastProvider({ children }: PropsWithChildren) {
  return (
    <>
      {children}
      <Toaster position="bottom-right" richColors closeButton />
    </>
  )
}

export function useToast() {
  return { toast: (message: string) => sonnerToast(message) }
}
