import { useCallback, useMemo, useState, type PropsWithChildren } from 'react'

import { ESCALA_KEY, EscalaContext, readStoredEscala, type Escala } from './escala'

/**
 * Guarda o Tamanho do conteúdo — a regra e as opções moram em `escala.ts`. Não aplica nada: quem
 * aplica é o `main` do shell, para as barras laterais ficarem de fora (pedido no uso, 2026-09-12).
 */
export function EscalaProvider({ children }: PropsWithChildren) {
  const [escala, setEscalaState] = useState<Escala>(readStoredEscala)

  const setEscala = useCallback((next: Escala) => {
    setEscalaState(next)
    try {
      localStorage.setItem(ESCALA_KEY, String(next))
    } catch {
      // Sem localStorage (modo privado etc.): vale só para esta sessão.
    }
  }, [])

  const value = useMemo(() => ({ escala, setEscala }), [escala, setEscala])
  return <EscalaContext.Provider value={value}>{children}</EscalaContext.Provider>
}
