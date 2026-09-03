import { Menu } from 'lucide-react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router'
import { useAuth } from '@/auth/useAuth'
import { REALMS, useServer } from '@/app/ServerContext'
import { useTheme } from '@/app/ThemeContext'
import { useState, type ReactNode } from 'react'
const labels = { west: 'West', east: 'East', europe: 'Europa' } as const
export function AppShell() {
  const { user, logout } = useAuth()
  const { realm, setRealm } = useServer()
  const { theme, setTheme } = useTheme()
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  return (
    <div className="min-h-screen bg-stone-950 text-stone-100">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded bg-amber-300 px-3 py-2 text-stone-950"
      >
        Pular para o conteúdo
      </a>
      <header className="border-b border-stone-800 bg-stone-900/95">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Link to="/" className="font-bold text-amber-300">
            Albion Profit Pro
          </Link>
          <button
            aria-label="Abrir menu"
            className="rounded border border-stone-700 px-3 py-1 md:hidden"
            onClick={() => setOpen(!open)}
          >
            <Menu className="size-5" aria-hidden="true" />
          </button>
          <nav
            className={`${open ? 'block' : 'hidden'} absolute left-0 right-0 top-14 z-40 border-b border-stone-700 bg-stone-900 p-4 md:static md:block md:border-0 md:p-0`}
            aria-label="Navegação principal"
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <NavLink to="/" end className="hover:text-amber-300">
                Market Flip
              </NavLink>
              <NavLink to="/refino" className="hover:text-amber-300">
                Refino
              </NavLink>
              <NavLink to="/craft" className="hover:text-amber-300">
                Craft
              </NavLink>
              <NavLink to="/item" className="hover:text-amber-300">
                Itens
              </NavLink>
              <NavLink to="/calculadora" className="hover:text-amber-300">
                Calculadora
              </NavLink>
              <NavLink to="/tokens" className="hover:text-amber-300">
                Tokens
              </NavLink>
              <label className="flex items-center gap-2 text-sm">
                Servidor
                <select
                  aria-label="Servidor"
                  value={realm ?? ''}
                  onChange={(e) =>
                    setRealm(e.target.value as (typeof REALMS)[number])
                  }
                  className="rounded border border-stone-700 bg-stone-950 px-2 py-1"
                >
                  <option value="" disabled>
                    Selecionar
                  </option>
                  {REALMS.map((r) => (
                    <option key={r} value={r}>
                      {labels[r]}
                    </option>
                  ))}
                </select>
              </label>
              <select
                aria-label="Tema"
                value={theme}
                onChange={(e) => setTheme(e.target.value as typeof theme)}
                className="rounded border border-stone-700 bg-stone-950 px-2 py-1"
              >
                <option value="system">Sistema</option>
                <option value="light">Claro</option>
                <option value="dark">Escuro</option>
              </select>
              <button
                className="text-left hover:text-amber-300"
                onClick={() => {
                  void logout()
                  void navigate('/login')
                }}
              >
                {user?.email ?? 'Sair'}
              </button>
            </div>
          </nav>
        </div>
      </header>
      <main id="conteudo" className="mx-auto max-w-7xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}
export function RequireRealm({ children }: { children: ReactNode }) {
  const { realm } = useServer()
  return realm ? (
    children
  ) : (
    <section className="mx-auto max-w-lg rounded-2xl border border-amber-400/30 bg-amber-400/10 p-8">
      <h1 className="text-2xl font-bold">Escolha um servidor</h1>
      <p className="mt-2 text-stone-300">
        Selecione West, East ou Europa no menu para consultar preços e
        simulações.
      </p>
    </section>
  )
}
