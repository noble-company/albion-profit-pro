import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from 'react'

export type Theme = 'light' | 'dark' | 'system'
type ResolvedTheme = 'light' | 'dark'
type ThemeContextValue = {
  theme: Theme
  resolvedTheme: ResolvedTheme
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)
const KEY = 'albion-profit-pro:theme'

function isTheme(value: string | null): value is Theme {
  return value === 'light' || value === 'dark' || value === 'system'
}

function systemPrefersDark() {
  return (
    typeof window !== 'undefined' &&
    Boolean(window.matchMedia?.('(prefers-color-scheme: dark)').matches)
  )
}

function getSystemTheme(): ResolvedTheme {
  return systemPrefersDark() ? 'dark' : 'light'
}

/** `useSyncExternalStore`: prefers-color-scheme é uma fonte externa que muda com o SO — não
 * é estado do React, então não se resolve com useState+useEffect (dispara
 * react-hooks/set-state-in-effect e atrasa um render). */
function subscribeToSystemTheme(onChange: () => void) {
  if (typeof window === 'undefined') return () => {}
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

function applyResolvedTheme(resolved: ResolvedTheme) {
  const root = document.documentElement
  root.dataset.theme = resolved
  root.style.colorScheme = resolved
}

function readStoredTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY)
    return isTheme(saved) ? saved : 'system'
  } catch {
    return 'system'
  }
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme)
  const systemTheme = useSyncExternalStore(
    subscribeToSystemTheme,
    getSystemTheme,
    () => 'dark' as const, // snapshot de servidor: nunca renderiza fora do browser aqui
  )
  const resolvedTheme: ResolvedTheme = theme === 'system' ? systemTheme : theme

  const setTheme = (next: Theme) => {
    setThemeState(next)
    try {
      localStorage.setItem(KEY, next)
    } catch {
      // Sem localStorage disponível (modo privado etc.): a escolha vale só
      // para esta sessão, sem persistir.
    }
  }

  useEffect(() => {
    applyResolvedTheme(resolvedTheme)
  }, [resolvedTheme])

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme],
  )
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('useTheme deve ser usado dentro de ThemeProvider')
  return value
}
