import { expect, test } from 'vitest'

// Task 3.5/24: `onRetry` do `EstadoErro` só existe pra chamar um refetch de verdade. Um
// `onRetry={() => undefined}` (ou `{}`) desenha o botão "Tentar novamente" que não faz nada —
// pior que não ter botão. Se o retry não é acionável, não passe a prop.

const sources: Record<string, string> = import.meta.glob('/src/**/*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
})

const INERT = /onRetry=\{\s*\(\s*\)\s*=>\s*(undefined|\{\s*\}|null|void 0)\s*\}/

// Telas de demonstração dev-only (rotas /estilo e /ui) mostram o cartão de erro como
// exemplo visual — ali o botão não tem pra onde ir. Não são o produto.
const DEMO = ['/src/design/', '/src/components/ui/Preview.tsx']

test('nenhum onRetry inerte permanece nas telas do produto', () => {
  const offenders = Object.entries(sources)
    .filter(([path]) => !path.endsWith('.test.tsx'))
    .filter(
      ([path]) => !DEMO.some((demo) => path.startsWith(demo) || path === demo),
    )
    .filter(([, code]) => INERT.test(code))
    .map(([path]) => path)
  expect(offenders, `\n${offenders.join('\n')}\n`).toEqual([])
})
