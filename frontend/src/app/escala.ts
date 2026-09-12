import { createContext, useContext } from 'react'

/**
 * Tamanho da interface (pedido no uso, 2026-09-12: "deixar tudo uns 70% maior").
 *
 * A escala é o `font-size` da raiz. Quase tudo no Tailwind é `rem` — texto, espaçamento, ícones,
 * largura de coluna —, então a tela inteira cresce junto sem reescrever componente. O que é px de
 * propósito (bordas de 1 px) fica igual, como deve.
 *
 * Opções em vez de um valor fixo: a 170% a tabela pede rolagem lateral numa tela de laptop, e quem
 * joga em monitor grande pode querer mais que quem joga no notebook. 200% e 220% entraram depois
 * de testar os 170% ("aumentar o zoom em mais 50%").
 *
 * Fora de `EscalaContext.tsx` porque arquivo de componente que também exporta constante ou hook
 * perde o *fast refresh* do Vite (`react-refresh/only-export-components`) — o mesmo motivo de
 * `scanner/tela.ts`.
 */
export const ESCALAS = [100, 115, 130, 150, 170, 200, 220] as const
export type Escala = (typeof ESCALAS)[number]

export type EscalaContextValue = {
  escala: Escala
  setEscala: (escala: Escala) => void
}

export const EscalaContext = createContext<EscalaContextValue | null>(null)
export const ESCALA_KEY = 'albion-profit-pro:escala'
export const ESCALA_PADRAO: Escala = 100

function isEscala(value: number): value is Escala {
  return (ESCALAS as readonly number[]).includes(value)
}

/** Valor salvo fora das opções volta ao padrão — nunca uma tela gigante por um localStorage velho. */
export function readStoredEscala(): Escala {
  try {
    const salvo = Number(localStorage.getItem(ESCALA_KEY))
    return isEscala(salvo) ? salvo : ESCALA_PADRAO
  } catch {
    return ESCALA_PADRAO
  }
}

export function useEscala(): EscalaContextValue {
  const value = useContext(EscalaContext)
  if (!value) throw new Error('useEscala deve ser usado dentro de EscalaProvider')
  return value
}

/** A escala sem exigir o provider: a tabela também é montada em teste, sem ele. */
export function useEscalaAtual(): Escala {
  return useContext(EscalaContext)?.escala ?? ESCALA_PADRAO
}
