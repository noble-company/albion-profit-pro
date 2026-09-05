import { useEffect, useState } from 'react'

/**
 * Devolve `value` com atraso — reinicia o timer só quando `value` muda, não quando o
 * componente pai re-renderiza por outro motivo. É isso que resolve, na raiz, o bug de
 * `useBuscaItens` reiniciar o debounce a cada render por causa de `filters` recriado
 * (task 3.5/15, item 6): a chave de busca de verdade (texto normalizado) não muda a cada
 * render, só quando o usuário digita.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}
