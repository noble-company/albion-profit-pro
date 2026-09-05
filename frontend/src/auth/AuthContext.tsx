import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react'

import {
  getAccessToken,
  setAccessToken,
  subscribeUnauthorized,
} from '@/api/session'

import {
  fetchCurrentUser,
  loginUser,
  logoutUser,
  registerUser,
} from './service'
import { AuthContext, type AuthContextValue } from './context'
import type { AuthStatus, AuthUser, Credentials } from './types'

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [status, setStatus] = useState<AuthStatus>(() =>
    getAccessToken() ? 'loading' : 'unauthenticated',
  )
  const [sessionExpired, setSessionExpired] = useState(false)

  const clearSession = useCallback((expired: boolean) => {
    setAccessToken(null)
    setUser(null)
    setStatus('unauthenticated')
    setSessionExpired(expired)
  }, [])

  useEffect(() => {
    const unsubscribe = subscribeUnauthorized(() => clearSession(true))
    const token = getAccessToken()
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
    setAccessToken(token)
    try {
      const currentUser = await fetchCurrentUser()
      setUser(currentUser)
      setStatus('authenticated')
    } catch (error) {
      setAccessToken(null)
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
