import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router'

import { RequireAuth } from '@/auth/RequireAuth'
import { LoginPage, RegisterPage } from '@/auth/pages'
import { AppShell } from '@/components/AppShell'
import { TokensPage } from '@/tokens/pages'
import { BuscaItem } from '@/items/pages'
import { ItemPricesPage } from '@/prices/pages'
import { CalculadoraPage } from '@/craft/pages'
import { MarketFlipPage } from '@/opportunities/pages'
import {
  CraftingRankingPage,
  RefiningRankingPage,
} from '@/opportunities/production-pages'

const LazyHome = lazy(() => Promise.resolve({ default: MarketFlipPage }))
const LazyItems = lazy(() => Promise.resolve({ default: BuscaItem }))
const LazyItem = lazy(() => Promise.resolve({ default: ItemPricesPage }))
const LazyCalculator = lazy(() => Promise.resolve({ default: CalculadoraPage }))
// Rota temporária da task 3.5/11 — demo dos primitivos shadcn/ui. Lazy pra não pesar o bundle
// principal com um arquivo que importa todos os componentes de uma vez.
const LazyUiPreview = lazy(() =>
  import('@/components/ui/Preview').then((m) => ({ default: m.UiPreview })),
)
function Boundary({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<p role="status">Carregando…</p>}>{children}</Suspense>
  )
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/registro" element={<RegisterPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route
            path="/"
            element={
              <Boundary>
                <LazyHome />
              </Boundary>
            }
          />
          <Route
            path="/item"
            element={
              <Boundary>
                <LazyItems />
              </Boundary>
            }
          />
          <Route
            path="/item/:uniqueName"
            element={
              <Boundary>
                <LazyItem />
              </Boundary>
            }
          />
          <Route
            path="/calculadora"
            element={
              <Boundary>
                <LazyCalculator />
              </Boundary>
            }
          />
          <Route path="/refino" element={<RefiningRankingPage />} />
          <Route path="/craft" element={<CraftingRankingPage />} />
          <Route path="/tokens" element={<TokensPage />} />
          <Route
            path="/ui"
            element={
              <Boundary>
                <LazyUiPreview />
              </Boundary>
            }
          />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
