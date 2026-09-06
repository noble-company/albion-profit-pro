import {
  ArrowLeftRight,
  Calculator,
  Hammer,
  KeyRound,
  Menu,
  Recycle,
  Search,
  type LucideIcon,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router'

import { REALMS, useServer, type Realm } from '@/app/ServerContext'
import { useTheme, type Theme } from '@/app/ThemeContext'
import { useAuth } from '@/auth/useAuth'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

const NAV: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: '/', label: 'Market Flip', icon: ArrowLeftRight, end: true },
  { to: '/refino', label: 'Refino', icon: Recycle },
  { to: '/craft', label: 'Craft', icon: Hammer },
  { to: '/item', label: 'Itens', icon: Search },
  { to: '/calculadora', label: 'Calculadora', icon: Calculator },
  { to: '/tokens', label: 'Tokens', icon: KeyRound },
]

const REALM_LABEL: Record<Realm, string> = {
  west: 'West',
  east: 'East',
  europe: 'Europa',
}
const THEME_LABEL: Record<Theme, string> = {
  system: 'Sistema',
  light: 'Claro',
  dark: 'Escuro',
}

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
              isActive
                ? 'bg-primary/15 text-primary'
                : 'text-foreground-muted hover:bg-surface-raised hover:text-foreground'
            }`
          }
        >
          <Icon className="size-4 shrink-0" aria-hidden="true" />
          {label}
        </NavLink>
      ))}
    </>
  )
}

function ContextControls() {
  const { realm, setRealm } = useServer()
  const { theme, setTheme } = useTheme()
  return (
    <>
      <Select
        value={realm ?? ''}
        onValueChange={(value) => setRealm(value as Realm)}
      >
        <SelectTrigger aria-label="Servidor" className="h-9 w-[7.5rem]">
          <SelectValue placeholder="Servidor" />
        </SelectTrigger>
        <SelectContent>
          {REALMS.map((option) => (
            <SelectItem key={option} value={option}>
              {REALM_LABEL[option]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={theme} onValueChange={(value) => setTheme(value as Theme)}>
        <SelectTrigger aria-label="Tema" className="h-9 w-[6.5rem]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(['system', 'light', 'dark'] as const).map((option) => (
            <SelectItem key={option} value={option}>
              {THEME_LABEL[option]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  )
}

export function AppShell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  const signOut = () => {
    void logout()
    void navigate('/login')
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <a
        href="#conteudo"
        className="sr-only bg-primary px-3 py-2 text-on-primary focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded"
      >
        Pular para o conteúdo
      </a>
      <header className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
          <Link
            to="/"
            className="shrink-0 font-black tracking-tight text-primary"
          >
            Albion Profit Pro
          </Link>
          <nav
            className="hidden items-center gap-1 md:flex"
            aria-label="Navegação principal"
          >
            <NavItems />
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <ContextControls />
            <Button
              variant="ghost"
              size="sm"
              className="hidden max-w-[12rem] truncate md:inline-flex"
              onClick={signOut}
            >
              {user?.email ?? 'Sair'}
            </Button>
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="md:hidden"
                  aria-label="Abrir menu"
                >
                  <Menu className="size-5" aria-hidden="true" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72">
                <SheetHeader>
                  <SheetTitle>Navegação</SheetTitle>
                </SheetHeader>
                <nav className="mt-6 flex flex-col gap-1">
                  <NavItems onNavigate={() => setMenuOpen(false)} />
                </nav>
                <Button
                  variant="ghost"
                  className="mt-6 w-full justify-start"
                  onClick={() => {
                    setMenuOpen(false)
                    signOut()
                  }}
                >
                  {user?.email ?? 'Sair'}
                </Button>
              </SheetContent>
            </Sheet>
          </div>
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
    <section className="mx-auto max-w-lg rounded-2xl border border-primary/30 bg-primary/10 p-8">
      <h1 className="text-2xl font-bold">Escolha um servidor</h1>
      <p className="mt-2 text-foreground">
        Selecione West, East ou Europa no menu para consultar preços e
        simulações.
      </p>
    </section>
  )
}
