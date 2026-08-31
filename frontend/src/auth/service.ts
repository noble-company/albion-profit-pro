import { apiClient, safeApiCall } from '@/api/client'
import { ApiError } from '@/api/errors'
import { setAccessToken } from '@/api/session'

import type { AuthUser, Credentials } from './types'

export const ACCESS_TOKEN_STORAGE_KEY = 'albion-profit-pro.access-token'

export async function registerUser({
  email,
  password,
}: Credentials): Promise<void> {
  await safeApiCall(() =>
    apiClient.POST('/auth/register', {
      body: {
        email,
        password,
        is_active: true,
        is_superuser: false,
        is_verified: false,
      },
    }),
  )
}

export async function loginUser({
  email,
  password,
}: Credentials): Promise<string> {
  const response = await safeApiCall(() =>
    apiClient.POST('/auth/login', {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: { username: email, password, scope: '', grant_type: 'password' },
    }),
  )
  const token = response.data?.access_token
  if (!token)
    throw new ApiError('A API não retornou uma sessão válida', {
      kind: 'network',
    })
  return token
}

export async function fetchCurrentUser(): Promise<AuthUser> {
  const response = await safeApiCall(() => apiClient.GET('/auth/me'))
  if (!response.data)
    throw new ApiError('A API não retornou o usuário', { kind: 'network' })
  return response.data
}

export async function logoutUser(): Promise<void> {
  try {
    await safeApiCall(() => apiClient.POST('/auth/logout'))
  } finally {
    setAccessToken(null)
    try {
      sessionStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY)
    } catch {
      // Storage may be unavailable in a privacy-restricted browser.
    }
  }
}

export function readStoredToken(): string | null {
  try {
    return sessionStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)
  } catch {
    return null
  }
}

export function writeStoredToken(token: string): void {
  sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token)
  setAccessToken(token)
}

export function clearStoredToken(): void {
  setAccessToken(null)
  try {
    sessionStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY)
  } catch {
    // Storage may be unavailable in a privacy-restricted browser.
  }
}
