import { expect, test } from 'vitest'

// F04 / task 3.5/15: a infra de fetch escrita à mão (polling com setInterval,
// AbortController manual pra cancelar requisição) foi substituída por TanStack Query —
// signal do próprio queryFn, refetchInterval/refetchIntervalInBackground. Este teste
// impede que ela volte por descuido. Arquivos de teste ficam de fora: chamar uma função de
// `service.ts` direto com `new AbortController().signal` ali é legítimo (não é infra de
// produção), é só o jeito de dar um signal pra assinatura da função.

const MANUAL_INTERVAL = /\bsetInterval\s*\(/
const MANUAL_ABORT_CONTROLLER = /\bnew\s+AbortController\s*\(/

const sources: Record<string, string> = import.meta.glob('/src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
})

test('nenhum setInterval ou AbortController manual em src/ (fora de testes)', () => {
  const offenders: string[] = []
  for (const [path, text] of Object.entries(sources)) {
    if (path.endsWith('no-manual-fetch-infra.test.ts')) continue
    if (path.includes('.test.') || path.includes('/test/')) continue
    text.split('\n').forEach((line, index) => {
      const where = `${path}:${index + 1}`
      if (MANUAL_INTERVAL.test(line)) {
        offenders.push(`${where} — setInterval manual`)
      }
      if (MANUAL_ABORT_CONTROLLER.test(line)) {
        offenders.push(`${where} — AbortController manual`)
      }
    })
  }
  expect(offenders, `\n${offenders.join('\n')}\n`).toEqual([])
})
