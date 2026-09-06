import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    // Vitest cobre só os testes unitários em src/. A suíte E2E (e2e/*.spec.ts) roda no
    // Playwright contra a stack real — `npm run test:e2e` (task 3.5/27).
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // A meta (task 3.5/26, item 4) é só onde está a lógica: money, projeção "e se",
      // fórmulas de craft, cliente HTTP, sessão, hooks de dados, sincronia URL↔estado.
      // Componente de apresentação fica de fora — perseguir número lá não paga.
      include: [
        'src/lib/**/*.ts',
        'src/api/**/*.ts',
        'src/**/hooks.ts',
        'src/**/service.ts',
        'src/opportunities/useOpportunityParams.ts',
      ],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.d.ts',
        'src/api/query.ts',
        'src/api/index.ts',
      ],
      // Piso medido em 2026-09-06 (96.05 / 89.75 / 97.58 / 98.03) menos folga pra churn
      // normal. É trava (ratchet), não meta aspiracional — sobe quando a cobertura real subir.
      thresholds: {
        statements: 92,
        branches: 84,
        functions: 93,
        lines: 93,
      },
    },
  },
})
