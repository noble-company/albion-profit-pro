import { useCallback, useEffect, useMemo, useState, type PropsWithChildren } from 'react'

import { ESCALA_KEY, EscalaContext, readStoredEscala, type Escala } from './escala'

/** Aplica e guarda o Tamanho da interface — a regra e as opções moram em `escala.ts`. */
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

  useEffect(() => {
    document.documentElement.style.fontSize = `${escala}%`
  }, [escala])

  const value = useMemo(() => ({ escala, setEscala }), [escala, setEscala])
  return <EscalaContext.Provider value={value}>{children}</EscalaContext.Provider>
}
