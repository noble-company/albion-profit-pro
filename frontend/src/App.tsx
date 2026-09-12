import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router'

import { RequireAuth } from '@/auth/RequireAuth'
import { LoginPage, RegisterPage } from '@/auth/pages'
import { AppShell } from '@/components/AppShell'
import { Carregando } from '@/components/ui/states'

// Code splitting de verdade (task 3.5/25, F11): cada rota de tela vira um chunk próprio,
// carregado sob demanda.
const MarketFlipPage = lazy(() =>
  import('@/opportunities/pages').then((m) => ({ default: m.MarketFlipPage })),
)
const BuscaItem = lazy(() =>
  import('@/items/pages').then((m) => ({ default: m.BuscaItem })),
)
const ItemPricesPage = lazy(() =>
  import('@/prices/pages').then((m) => ({ default: m.ItemPricesPage })),
)
const CalculadoraPage = lazy(() =>
  import('@/craft/pages').then((m) => ({ default: m.CalculadoraPage })),
)
const RefiningScannerPage = lazy(() =>
  import('@/scanner/ScannerPage').then((m) => ({
    default: m.RefiningScannerPage,
  })),
)
const CraftingScannerPage = lazy(() =>
  import('./scanner/ScannerPage').then((m) => ({
    default: m.CraftingScannerPage,
  })),
)
const ConsumablesScannerPage = lazy(() =>
  import('./scanner/ScannerPage').then((m) => ({
    default: m.ConsumablesScannerPage,
  })),
)
const DestinyBoardPage = lazy(() =>
  import('./destiny/DestinyBoardPage').then((m) => ({ default: m.DestinyBoardPage })),
)
const TokensPage = lazy(() =>
  import('@/tokens/pages').then((m) => ({ default: m.TokensPage })),
)
// Rotas de desenvolvimento (tasks 3.5/11 e 3.5/14).
const UiPreview = lazy(() =>
  import('@/components/ui/Preview').then((m) => ({ default: m.UiPreview })),
)
const LinguagemVisualPage = lazy(() =>
  import('@/design/LinguagemVisualPage').then((m) => ({
    default: m.LinguagemVisualPage,
  })),
)

function Boundary({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<Carregando label="Carregando a tela…" />}>
      {children}
    </Suspense>
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
                <MarketFlipPage />
              </Boundary>
            }
          />
          <Route
            path="/item"
            element={
              <Boundary>
                <BuscaItem />
              </Boundary>
            }
          />
          <Route
            path="/item/:uniqueName"
            element={
              <Boundary>
                <ItemPricesPage />
              </Boundary>
            }
          />
          <Route
            path="/painel"
            element={
              <Boundary>
                <DestinyBoardPage />
              </Boundary>
            }
          />
          <Route
            path="/calculadora"
            element={
              <Boundary>
                <CalculadoraPage />
              </Boundary>
            }
          />
          <Route
            path="/refino"
            element={
              <Boundary>
                <RefiningScannerPage />
              </Boundary>
            }
          />
          <Route
            path="/craft"
            element={
              <Boundary>
                <CraftingScannerPage />
              </Boundary>
            }
          />
          <Route
            path="/consumiveis"
            element={
              <Boundary>
                <ConsumablesScannerPage />
              </Boundary>
            }
          />
          <Route
            path="/tokens"
            element={
              <Boundary>
                <TokensPage />
              </Boundary>
            }
          />
          <Route
            path="/ui"
            element={
              <Boundary>
                <UiPreview />
              </Boundary>
            }
          />
          <Route
            path="/estilo"
            element={
              <Boundary>
                <LinguagemVisualPage />
              </Boundary>
            }
          />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
