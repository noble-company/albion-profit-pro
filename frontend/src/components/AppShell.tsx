import {
  ArrowLeftRight,
  Calculator,
  CookingPot,
  Hammer,
  KeyRound,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Recycle,
  Search,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'

import { REALMS, useServer, type Realm } from '@/app/ServerContext'
import { useTheme, type Theme } from '@/app/ThemeContext'
import { useAuth } from '@/auth/useAuth'
import { ErrorBoundary } from '@/components/shell/ErrorBoundary'
import {
  SidebarSlotProvider,
  useSidebarSlotContainer,
} from '@/components/shell/SidebarSlot'
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

/**
 * Shell do produto (tasks 4/08 e 4/11.1).
 *
 * Três colunas: **navegação à esquerda** (colapsável), conteúdo no meio ocupando o que sobra, e
 * **filtros à direita**. A separação é de uso, não de estética: navegação se usa uma vez por
 * sessão, filtro se mexe o tempo todo — e cada pixel que a navegação não gasta é largura para a
 * tabela, que já tem 10 colunas.
 *
 * Nada de largura máxima aqui. Se alguém reintroduzir, `src/test/no-max-width-shell.test.ts`
 * quebra.
 */

const NAV: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: '/', label: 'Market Flip', icon: ArrowLeftRight, end: true },
  { to: '/refino', label: 'Refino', icon: Recycle },
  { to: '/craft', label: 'Craft', icon: Hammer },
  { to: '/consumiveis', label: 'Comida & Poções', icon: CookingPot },
  { to: '/item', label: 'Itens', icon: Search },
  { to: '/painel', label: 'Painel do Destino', icon: Sparkles },
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

const COLLAPSE_KEY = 'albion-profit-pro:nav-collapsed'
/** Filtros recolhidos devolvem 320 px à tabela (task 4/20) — e quem recolhe quer amanhã também. */
const FILTERS_COLLAPSE_KEY = 'albion-profit-pro:filters-collapsed'

function NavItems({
  collapsed,
  onNavigate,
}: {
  collapsed?: boolean
  onNavigate?: () => void
}) {
  return (
    <>
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          // Colapsada, o rótulo visível some — o nome acessível vem do `aria-label`, senão o
          // link viraria um ícone anônimo para leitor de tela.
          aria-label={collapsed ? label : undefined}
          title={collapsed ? label : undefined}
          className={({ isActive }) =>
            `flex items-center gap-2 rounded-lg py-2 text-sm font-medium transition ${
              collapsed ? 'justify-center px-2' : 'px-3'
            } ${
              isActive
                ? 'bg-primary/15 text-primary'
                : 'text-foreground-muted hover:bg-surface-raised hover:text-foreground'
            }`
          }
        >
          <Icon className="size-4 shrink-0" aria-hidden="true" />
          {!collapsed && label}
        </NavLink>
      ))}
    </>
  )
}

function RealmSelect({ className }: { className?: string }) {
  const { realm, setRealm } = useServer()
  return (
    <Select value={realm ?? ''} onValueChange={(value) => setRealm(value as Realm)}>
      <SelectTrigger aria-label="Servidor" className={className ?? 'h-9 w-full'}>
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
  )
}

function ThemeSelect({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme()
  return (
    <Select value={theme} onValueChange={(value) => setTheme(value as Theme)}>
      <SelectTrigger aria-label="Tema" className={className ?? 'h-9 w-full'}>
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
  )
}

/** Coluna da esquerda: **só navegação** e contexto de conta. Filtros vivem à direita. */
function NavColumn({
  collapsed,
  onNavigate,
  onSignOut,
  email,
}: {
  collapsed: boolean
  onNavigate?: () => void
  onSignOut: () => void
  email?: string
}) {
  return (
    <div className="flex h-full flex-col">
      <nav
        className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-3"
        aria-label="Navegação principal"
      >
        <NavItems collapsed={collapsed} onNavigate={onNavigate} />
      </nav>

      <div className="space-y-2 border-t border-border px-2 py-3">
        {!collapsed && (
          <>
            <RealmSelect />
            <ThemeSelect />
          </>
        )}
        <Button
          variant="ghost"
          size="sm"
          aria-label={collapsed ? 'Sair' : undefined}
          title={collapsed ? (email ?? 'Sair') : undefined}
          className={`w-full gap-2 truncate ${collapsed ? 'justify-center px-0' : 'justify-start'}`}
          onClick={onSignOut}
        >
          <LogOut className="size-4 shrink-0" aria-hidden="true" />
          {!collapsed && <span className="truncate">{email ?? 'Sair'}</span>}
        </Button>
      </div>
    </div>
  )
}

export function AppShell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [slot, setSlot] = useSidebarSlotContainer()
  const [hasFilters, setHasFilters] = useState(false)
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(COLLAPSE_KEY) === 'true',
  )

  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, String(collapsed))
  }, [collapsed])

  const [filtersCollapsed, setFiltersCollapsed] = useState(
    () => localStorage.getItem(FILTERS_COLLAPSE_KEY) === 'true',
  )

  useEffect(() => {
    localStorage.setItem(FILTERS_COLLAPSE_KEY, String(filtersCollapsed))
  }, [filtersCollapsed])

  const signOut = () => {
    void logout()
    void navigate('/login')
  }

  return (
    <SidebarSlotProvider container={slot} setHasContent={setHasFilters}>
      {/* Altura de tela com `overflow-hidden`: cada coluna rola por si. Sem isso o flex estica
          as laterais até a altura da página e elas sobem junto com a tabela. */}
      <div className="flex h-dvh overflow-hidden bg-background text-foreground">
        <a
          href="#conteudo"
          className="sr-only bg-primary px-3 py-2 text-on-primary focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded"
        >
          Pular para o conteúdo
        </a>

        <aside
          className={`hidden h-full shrink-0 flex-col border-r border-border bg-surface transition-[width] md:flex ${
            collapsed ? 'w-14' : 'w-52'
          }`}
        >
          <div
            className={`flex shrink-0 items-center gap-1 px-2 py-3 ${
              collapsed ? 'justify-center' : 'justify-between'
            }`}
          >
            {!collapsed && (
              <Link
                to="/"
                className="truncate px-1 text-base font-black tracking-tight text-primary"
              >
                Albion Profit Pro
              </Link>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              aria-label={collapsed ? 'Expandir navegação' : 'Colapsar navegação'}
              aria-expanded={!collapsed}
              onClick={() => setCollapsed((value) => !value)}
            >
              {collapsed ? (
                <PanelLeftOpen className="size-4" aria-hidden="true" />
              ) : (
                <PanelLeftClose className="size-4" aria-hidden="true" />
              )}
            </Button>
          </div>
          <NavColumn collapsed={collapsed} onSignOut={signOut} email={user?.email} />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Barra mobile: servidor e tema sempre visíveis. Servidor errado é erro de leitura —
              não deveria exigir abrir o menu para corrigir. */}
          <div className="flex items-center gap-2 border-b border-border bg-surface px-3 py-2 md:hidden">
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" aria-label="Abrir menu">
                  <Menu className="size-5" aria-hidden="true" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-80 p-0">
                <SheetHeader className="px-4 py-4">
                  <SheetTitle className="text-primary">Albion Profit Pro</SheetTitle>
                </SheetHeader>
                <NavColumn
                  collapsed={false}
                  onNavigate={() => setMenuOpen(false)}
                  onSignOut={() => {
                    setMenuOpen(false)
                    signOut()
                  }}
                  email={user?.email}
                />
              </SheetContent>
            </Sheet>
            <RealmSelect className="h-9 w-32" />
            <ThemeSelect className="h-9 w-28" />
          </div>

          <main id="conteudo" className="min-w-0 flex-1 overflow-y-auto px-4 py-4">
            {/* Dentro do shell de propósito: uma tela que quebra não pode apagar a navegação
                (achado E04 — antes disso, virava tela branca). */}
            {/* `search` junto do `pathname`: quando o que derruba a tela é um filtro (e é o
                caso mais comum — o filtro alimenta o cálculo), mexer no filtro tem que
                devolver a tela. Só com o pathname o usuário ficava preso no estado de erro
                mesmo trocando de filtro, porque a rota não muda. */}
            <ErrorBoundary resetKey={`${location.pathname}${location.search}`}>
              <Outlet />
            </ErrorBoundary>
          </main>
        </div>

        {/* Painel de filtros, à direita desde a 11.1. Fica sempre montado (o portal precisa do
            nó), mas some da largura quando a tela não publica filtro — sem faixa vazia. */}
        <aside
          aria-label="Filtros"
          className={`hidden h-full shrink-0 overflow-y-auto border-l border-border bg-surface md:block ${
            !hasFilters ? 'w-0 border-l-0' : filtersCollapsed ? 'w-14' : 'w-80'
          }`}
        >
          {hasFilters && (
            <div
              className={`flex px-2 pt-3 ${filtersCollapsed ? 'justify-center' : 'justify-start'}`}
            >
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0"
                aria-label={filtersCollapsed ? 'Expandir filtros' : 'Recolher filtros'}
                aria-expanded={!filtersCollapsed}
                onClick={() => setFiltersCollapsed((value) => !value)}
              >
                {filtersCollapsed ? (
                  <PanelRightOpen className="size-4" aria-hidden="true" />
                ) : (
                  <PanelRightClose className="size-4" aria-hidden="true" />
                )}
              </Button>
            </div>
          )}
          {/* Recolhido, o nó do portal continua montado — a tela injeta os filtros nele e
              perderia o estado dos campos se ele sumisse. Só fica escondido. */}
          <div ref={setSlot} hidden={hasFilters && filtersCollapsed} />
        </aside>
      </div>
    </SidebarSlotProvider>
  )
}

export function RequireRealm({ children }: { children: ReactNode }) {
  const { realm } = useServer()
  return realm ? (
    children
  ) : (
    <section className="max-w-lg rounded-2xl border border-primary/30 bg-primary/10 p-8">
      <h1 className="text-2xl font-bold">Escolha um servidor</h1>
      <p className="mt-2 text-foreground">
        Selecione West, East ou Europa no menu para consultar preços e simulações.
      </p>
    </section>
  )
}
