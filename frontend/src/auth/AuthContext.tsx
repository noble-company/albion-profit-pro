import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react'

import { subscribeUnauthorized } from '@/api/session'

import {
  clearStoredToken,
  fetchCurrentUser,
  loginUser,
  logoutUser,
  readStoredToken,
  registerUser,
  writeStoredToken,
} from './service'
import { AuthContext, type AuthContextValue } from './context'
import type { AuthStatus, AuthUser, Credentials } from './types'

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [status, setStatus] = useState<AuthStatus>(() =>
    readStoredToken() ? 'loading' : 'unauthenticated',
  )
  const [sessionExpired, setSessionExpired] = useState(false)

  const clearSession = useCallback((expired: boolean) => {
    clearStoredToken()
    setUser(null)
    setStatus('unauthenticated')
    setSessionExpired(expired)
  }, [])

  useEffect(() => {
    const unsubscribe = subscribeUnauthorized(() => clearSession(true))
    const token = readStoredToken()
    if (!token) return unsubscribe
    void fetchCurrentUser()
      .then((currentUser) => {
        setUser(currentUser)
        setStatus('authenticated')
      })
      .catch(() => clearSession(true))
    return unsubscribe
  }, [clearSession])

  const login = useCallback(async (credentials: Credentials) => {
    setSessionExpired(false)
    const token = await loginUser(credentials)
    writeStoredToken(token)
    try {
      const currentUser = await fetchCurrentUser()
      setUser(currentUser)
      setStatus('authenticated')
    } catch (error) {
      clearStoredToken()
      setUser(null)
      setStatus('unauthenticated')
      throw error
    }
  }, [])

  const register = useCallback(async (credentials: Credentials) => {
    await registerUser(credentials)
  }, [])

  const logout = useCallback(async () => {
    try {
      await logoutUser()
    } finally {
      setUser(null)
      setStatus('unauthenticated')
      setSessionExpired(false)
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status,
      sessionExpired,
      login,
      register,
      logout,
      clearSessionExpired: () => setSessionExpired(false),
    }),
    [login, logout, register, sessionExpired, status, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
