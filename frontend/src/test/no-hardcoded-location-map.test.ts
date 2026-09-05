import { expect, test } from 'vitest'

// F06 / task 3.5/19: o nome de uma cidade vem de um lugar só — a tabela `location` no
// backend, via `GET /locations` (hook `useLocations`, política `catalog`). Antes disso três
// mapas `location_id → nome` viviam no cliente (`lib/formatters.ts`, `opportunities/pages.tsx`,
// `prices/pages.tsx`) e já discordavam entre si — Lymhurst com IDs diferentes, "Covil do
// Inferno" vs "Hell Den". Este teste impede que qualquer um deles volte.

const sources: Record<string, string> = import.meta.glob('/src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
})

function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

// IDs de localização do Albion: 3-4 dígitos ("3005", "0007"), às vezes com sufixo
// ("1000-HellDen"). Duas ou mais chaves assim num objeto = um mapa de localização.
const LOCATION_KEY = /(["'])\d{3,4}(-[A-Za-z]+)?\1\s*:/g

test('nenhum mapa location_id → nome mora no cliente', () => {
  const offenders: string[] = []
  for (const [path, raw] of Object.entries(sources)) {
    if (
      path.includes('/test/') ||
      path.endsWith('.test.ts') ||
      path.endsWith('.test.tsx')
    ) {
      continue
    }
    const code = stripComments(raw)
    const keyHits = code.match(LOCATION_KEY) ?? []
    if (keyHits.length >= 2) {
      offenders.push(
        `${path}: ${keyHits.length} chaves de location_id em objeto literal`,
      )
    }
  }
  expect(offenders, `\n${offenders.join('\n')}\n`).toEqual([])
})

test('formatadores de localidade/jogador não voltam', () => {
  const banned = [
    'formatarLocalidade',
    'formatarNomeJogador',
    'formatarCategoria',
  ]
  const offenders: string[] = []
  for (const [path, raw] of Object.entries(sources)) {
    if (path.endsWith('no-hardcoded-location-map.test.ts')) continue
    const code = stripComments(raw)
    for (const name of banned) {
      if (new RegExp(`\\b${name}\\b`).test(code)) {
        offenders.push(`${path}: ${name}`)
      }
    }
  }
  expect(offenders, `\n${offenders.join('\n')}\n`).toEqual([])
})
