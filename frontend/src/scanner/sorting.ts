import { compare } from '@/lib/money'

import type { ScannerRow } from './engine'

/**
 * Ordenação do scanner (task 4/10) — sobre o **conjunto inteiro**, no cliente.
 *
 * Isto seria o `F08` de volta se o conjunto fosse uma página do servidor: reordenar 25 linhas
 * recebidas e chamar de "melhor refino" é mentira. Aqui não é página, é o catálogo todo já
 * calculado — ordenar localmente é o único jeito correto.
 */

export type SortField =
  | 'tier'
  | 'profit'
  | 'roi'
  | 'profitPerWeight'
  | 'profitPerFocus'
  | 'totalCost'
  | 'averageUnitCost'
  | 'freshness'

export type SortDirection = 'asc' | 'desc'

export interface SortState {
  field: SortField
  direction: SortDirection
}

/**
 * Tier crescente (task 4/19): a lista se lê como o mercado do jogo — T2, T3, T4.0, T4.1, T4.2…
 * Clicar num cabeçalho continua ordenando por lucro, ROI e o resto.
 */
export const DEFAULT_SORT: SortState = { field: 'tier', direction: 'asc' }

/**
 * Campos cuja ordem **não depende de preço**. Neles a linha sem cotação fica na posição dela, e o
 * primeiro clique ordena crescente (T2 → T8), não decrescente como os números — "maior primeiro"
 * faz sentido para lucro, não para tier.
 */
export const CAMPOS_ESTRUTURAIS: ReadonlySet<SortField> = new Set<SortField>(['tier'])

/** Nome que o jogador lê. O padrão é o código, que só serve quando não há catálogo à mão. */
type NomeDe = (uniqueName: string) => string

const peloCodigo: NomeDe = (uniqueName) => uniqueName

function porNome(a: ScannerRow, b: ScannerRow, nome: NomeDe): number {
  return nome(a.outputItem).localeCompare(nome(b.outputItem), 'pt-BR')
}

/**
 * Linha sem preço vai **sempre para o fim** quando o campo é um número calculado. Ela não é
 * "lucro zero" nem "o pior resultado" — é ausência, e ordenar ausência junto com número inventa
 * uma posição que o dado não sustenta.
 */
function compareRows(a: ScannerRow, b: ScannerRow, field: SortField, nome: NomeDe): number {
  if (field === 'tier') {
    // Item sem tier no dump vai depois dos que têm: não existe "tier zero" para ele ocupar.
    const ta = a.tier ?? Number.POSITIVE_INFINITY
    const tb = b.tier ?? Number.POSITIVE_INFINITY
    if (ta !== tb) return ta < tb ? -1 : 1
    if (a.enchantmentLevel !== b.enchantmentLevel) {
      return a.enchantmentLevel - b.enchantmentLevel
    }
    return porNome(a, b, nome)
  }

  if (field === 'freshness') {
    const va = a.oldestObservedAt
    const vb = b.oldestObservedAt
    if (va === null && vb === null) return 0
    if (va === null) return 1
    if (vb === null) return -1
    return va - vb
  }

  const va = a[field]
  const vb = b[field]
  if (va === null && vb === null) return 0
  if (va === null) return 1
  if (vb === null) return -1
  return compare(va, vb)
}

export function sortRows(
  rows: ScannerRow[],
  sort: SortState,
  nome: NomeDe = peloCodigo,
): ScannerRow[] {
  const semPreco = (row: ScannerRow) => row.state !== 'priced'
  const fator = sort.direction === 'asc' ? 1 : -1
  // Em ordem estrutural a posição não depende de preço: mandar `Couro T4.2` sem cotação para
  // depois do T8 quebraria justamente a leitura que a ordem por tier existe para dar.
  const estrutural = CAMPOS_ESTRUTURAIS.has(sort.field)

  return [...rows].sort((a, b) => {
    // Ausência primeiro que direção: inverter a ordenação não pode trazer linha sem preço
    // para o topo.
    if (!estrutural && semPreco(a) !== semPreco(b)) return semPreco(a) ? 1 : -1

    const base = compareRows(a, b, sort.field, nome)
    if (base !== 0) return base * fator

    // Desempate total, para a ordem ser estável entre renders e entre sessões.
    return (
      porNome(a, b, nome) ||
      a.outputItem.localeCompare(b.outputItem, 'pt-BR') ||
      a.locationId.localeCompare(b.locationId)
    )
  })
}
