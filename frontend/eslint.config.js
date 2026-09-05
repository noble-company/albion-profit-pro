import eslint from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'playwright-report', 'test-results'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ['**/*.{ts,tsx}'],
  })),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-refresh': reactRefresh,
    },
    rules: {
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      // F09 / task 3.5/18: dinheiro é string decimal — nunca `number`. Proíbe
      // `Number(x.profit)` / `parseFloat(x.roi)` e afins sobre campos monetários do contrato.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'CallExpression[callee.name=/^(Number|parseFloat|parseInt)$/] > MemberExpression[property.name=/^(profit|profit_per_unit|roi|min_profit|min_roi|buy_price|sell_price|gross_revenue|net_revenue|total_cost|total_fees|sales_tax|sale_setup_fee|acquisition_setup_fee|station_cost|expected_return_quantity|effective_quantity|unit_price|unit_price_silver|best_price|average_price)$/]',
          message:
            'Dinheiro é string decimal — use @/lib/money em vez de Number()/parseFloat() (F09).',
        },
      ],
    },
  },
  {
    files: ['*.config.{js,ts}', 'scripts/**/*.mjs'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['src/test/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    // Componentes shadcn/ui vendorizados: exportam o componente + a função de variantes cva
    // no mesmo arquivo (padrão da lib). Regra desligada só nessa pasta.
    files: ['src/components/ui/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
)
