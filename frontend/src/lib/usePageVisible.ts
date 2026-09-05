import { useSyncExternalStore } from 'react'

/**
 * `true` enquanto a aba está visível. `useSyncExternalStore` porque `document.visibilityState`
 * é uma fonte externa (o navegador muda quando o usuário troca de aba).
 *
 * Usado para o selo "Atualização automática · 30s" das telas de oportunidade (task 3.5/21,
 * item 7): o `refetchInterval` do TanStack Query roda com `refetchIntervalInBackground: false`,
 * então com a aba oculta o polling **não** acontece — o selo não pode prometer o que não faz.
 */
function subscribe(onChange: () => void) {
  document.addEventListener('visibilitychange', onChange)
  return () => document.removeEventListener('visibilitychange', onChange)
}

export function usePageVisible(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => document.visibilityState === 'visible',
    () => true,
  )
}
