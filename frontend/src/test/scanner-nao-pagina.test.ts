import { expect, test } from 'vitest'

/**
 * Task 4/10. O invariante que substitui o `no-client-paging-mutation` **para o scanner**.
 *
 * Aquele guard (F08, task 3.5/17) proíbe ordenar/filtrar a *página já recebida*, porque tratar
 * uma amostra paginada como o todo é mentira. Ele continua valendo para as telas que ainda são
 * paginadas pelo servidor (Market Flip, Preços) e segue no lugar.
 *
 * No scanner a regra se inverte: o conjunto inteiro está em memória, e ordenar/filtrar
 * localmente é o único jeito correto. A regressão perigosa aqui é a oposta — reintroduzir
 * paginação, que faria a página virar o universo de novo.
 */

const sources: Record<string, string> = import.meta.glob('/src/scanner/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
})

function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

test('o scanner não importa o componente de paginação', () => {
  const offenders: string[] = []
  for (const [path, raw] of Object.entries(sources)) {
    if (path.endsWith('.test.ts') || path.endsWith('.test.tsx')) continue
    if (/from\s+['"][^'"]*Pagination['"]/.test(stripComments(raw))) {
      offenders.push(path)
    }
  }
  expect(
    offenders,
    `paginar o scanner devolve o F08: a página vira o universo.\n${offenders.join('\n')}`,
  ).toEqual([])
})

test('o scanner não recorta o conjunto antes de mostrar', () => {
  const offenders: string[] = []
  for (const [path, raw] of Object.entries(sources)) {
    if (path.endsWith('.test.ts') || path.endsWith('.test.tsx')) continue
    const code = stripComments(raw)
    // `.slice(offset, offset + limit)` sobre as linhas é paginação com outro nome.
    if (/\brows\s*\.\s*slice\s*\(/.test(code)) {
      offenders.push(`${path}: slice sobre as linhas`)
    }
  }
  expect(offenders, `\n${offenders.join('\n')}\n`).toEqual([])
})

test('a tabela virtualiza', () => {
  const table = sources['/src/scanner/ScannerTable.tsx'] ?? ''
  expect(table, 'ScannerTable.tsx não foi lido').toBeTruthy()
  // Não prova que a virtualização funciona (só o navegador prova) — prova que ela não foi
  // trocada por renderizar tudo, que mataria a aba com 5.523 linhas.
  expect(stripComments(table)).toMatch(/useVirtualizer/)
})
