import type { components } from '@/api/schema'

export type AuthUser = components['schemas']['UserRead']
export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'
export type Credentials = { email: string; password: string }
export type Registration = Credentials & { passwordConfirmation: string }
