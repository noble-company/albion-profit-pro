import { expect, test } from 'vitest'

// F08 / task 3.5/17: ordenação e filtragem de qualidade/encantamento agora acontecem no
// servidor, sobre o conjunto completo. Reordenar ou filtrar a PÁGINA já recebida trata uma
// amostra paginada como se fosse o todo. Este teste impede a volta.
//
// (A aritmética de dinheiro no cliente — `Number(row.profit)` para KPIs e fallbacks — é
// outro achado, `F09`, tratado na task 18. Aqui só a mutação da página.)
//
// Nota: o "e se" do cliente (task 23) reordena localmente por desenho — ali o conjunto em
// memória é o universo relevante. Não são os arquivos cobertos aqui.
//
// Task 4/10: o scanner (`src/scanner/`) também fica de fora, e pelo motivo oposto — lá o
// conjunto inteiro está em memória e ordenar localmente é o único jeito correto. A regressão
// perigosa dele é a inversa (reintroduzir paginação), coberta por
// `src/test/scanner-nao-pagina.test.ts`.
//
// Task 4/15: `production-pages.tsx` saiu da lista porque foi apagada com o ranking
// materializado. As duas que sobraram continuam paginadas pelo servidor, e para elas o
// invariante é o mesmo de sempre.

const PAGED_FILES = ['/src/opportunities/pages.tsx', '/src/prices/pages.tsx']

const sources: Record<string, string> = import.meta.glob('/src/**/*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
})

function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

test('nenhuma reordenação ou filtragem da página nos componentes paginados', () => {
  const offenders: string[] = []
  for (const path of PAGED_FILES) {
    const raw = sources[path]
    expect(raw, `${path} não foi lido`).toBeTruthy()
    const code = stripComments(raw ?? '')

    // .opportunities.sort(...) / .prices.filter(...) — mutação do resultado paginado.
    if (/\.(opportunities|prices)\s*\??\s*\.\s*(sort|filter)\b/.test(code)) {
      offenders.push(`${path}: sort/filter direto sobre o array paginado`)
    }
    // .sort((a, b) => ...) — um comparador é sempre um reordenamento de linhas.
    if (/\.\s*sort\s*\(\s*\(/.test(code)) {
      offenders.push(`${path}: .sort() com comparador`)
    }
  }
  expect(offenders, `\n${offenders.join('\n')}\n`).toEqual([])
})
