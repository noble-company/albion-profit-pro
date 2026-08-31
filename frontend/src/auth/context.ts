import { createContext } from 'react'

import type { AuthStatus, AuthUser, Credentials } from './types'

export type AuthContextValue = {
  user: AuthUser | null
  status: AuthStatus
  sessionExpired: boolean
  login: (credentials: Credentials) => Promise<void>
  register: (credentials: Credentials) => Promise<void>
  logout: () => Promise<void>
  clearSessionExpired: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)
