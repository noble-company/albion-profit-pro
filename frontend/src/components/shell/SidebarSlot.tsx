import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

/**
 * Slot de filtros do shell (tasks 4/08 e 4/11.1).
 *
 * A tela declara `<SidebarSection title="Filtros">…</SidebarSection>` e o conteúdo aparece na
 * barra lateral, sem a tela precisar conhecer o layout. **Desde a 11.1 esse painel fica à
 * direita** — a esquerda ficou só com navegação.
 *
 * O nome continua `SidebarSection` de propósito: ele descreve "seção da barra lateral", não
 * qual lado. Renomear obrigaria a mexer em toda tela que publica filtro, sem ganho.
 *
 * **Portal, e não `ReactNode` em contexto.** Guardar o conteúdo em `useState` obrigaria a tela
 * a chamar `setState` durante o render do filho — render em cascata, o que o `react-hooks`
 * acusou na task 07.
 */

interface SlotContextValue {
  container: HTMLElement | null
  /** avisa o shell que há filtros publicados, para ele não deixar uma faixa vazia */
  setHasContent: (has: boolean) => void
}

const SidebarSlotContext = createContext<SlotContextValue>({
  container: null,
  setHasContent: () => {},
})

export function SidebarSlotProvider({
  container,
  setHasContent,
  children,
}: {
  container: HTMLElement | null
  setHasContent: (has: boolean) => void
  children: ReactNode
}) {
  return (
    <SidebarSlotContext.Provider value={{ container, setHasContent }}>
      {children}
    </SidebarSlotContext.Provider>
  )
}

/**
 * Guarda o nó do slot em estado (via callback ref) em vez de `useRef`: um ref não dispara
 * re-render quando o nó aparece, e o portal ficaria esperando para sempre no primeiro mount.
 */
export function useSidebarSlotContainer() {
  return useState<HTMLElement | null>(null)
}

export function SidebarSection({
  title,
  children,
}: {
  title?: string
  children: ReactNode
}) {
  const { container, setHasContent } = useContext(SidebarSlotContext)

  // Avisa o shell enquanto esta seção existe, para o painel direito não ocupar largura numa
  // tela sem filtros. O `false` na limpeza é o que faz a coluna sumir ao trocar de rota.
  useEffect(() => {
    setHasContent(true)
    return () => setHasContent(false)
  }, [setHasContent])

  if (!container) return null

  return createPortal(
    <section className="space-y-3 px-3 py-4">
      {title && (
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground-subtle">
          {title}
        </h2>
      )}
      {children}
    </section>,
    container,
  )
}
