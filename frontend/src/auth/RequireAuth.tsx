import { Navigate, Outlet, useLocation } from 'react-router'

import { useAuth } from './useAuth'

export function RequireAuth() {
  const { status, sessionExpired } = useAuth()
  const location = useLocation()
  if (status === 'loading')
    return (
      <p className="grid min-h-screen place-items-center bg-background text-foreground">
        Carregando sessão…
      </p>
    )
  if (status === 'unauthenticated') {
    const destination = `${location.pathname}${location.search}`
    const reason = sessionExpired ? '&reason=expired' : ''
    return (
      <Navigate
        to={`/login?next=${encodeURIComponent(destination)}${reason}`}
        replace
      />
    )
  }
  return <Outlet />
}
