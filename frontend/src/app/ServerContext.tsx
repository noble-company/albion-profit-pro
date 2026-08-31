import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react'

export const REALMS = ['west', 'east', 'europe'] as const
export type Realm = (typeof REALMS)[number]
const STORAGE_KEY = 'albion-profit-pro:realm'
type ServerContextValue = {
  realm: Realm | null
  setRealm: (realm: Realm) => void
  clearRealm: () => void
}
const ServerContext = createContext<ServerContextValue | null>(null)

function readRealm(): Realm | null {
  const value = localStorage.getItem(STORAGE_KEY)
  return REALMS.includes(value as Realm) ? (value as Realm) : null
}

export function ServerProvider({ children }: PropsWithChildren) {
  const [realm, setRealmState] = useState<Realm | null>(() => readRealm())
  const setRealm = (next: Realm) => {
    setRealmState(next)
    localStorage.setItem(STORAGE_KEY, next)
  }
  const clearRealm = () => {
    setRealmState(null)
    localStorage.removeItem(STORAGE_KEY)
  }
  useEffect(() => {
    if (realm) localStorage.setItem(STORAGE_KEY, realm)
  }, [realm])
  const value = useMemo(() => ({ realm, setRealm, clearRealm }), [realm])
  return (
    <ServerContext.Provider value={value}>{children}</ServerContext.Provider>
  )
}

export function useServer() {
  const value = useContext(ServerContext)
  if (!value)
    throw new Error('useServer deve ser usado dentro de ServerProvider')
  return value
}
