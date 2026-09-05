import type { CSSProperties, ReactNode } from 'react'

import type { Opportunity } from '@/opportunities/service'

import { TabelaCarregando } from './TabelaCarregando'

/**
 * Coluna da tabela de oportunidades (task 3.5/14 §1–2, task 3.5/21).
 *
 * - `cell` recebe a linha tipada pelo schema OpenAPI (`OpportunityOut`) — mudança de contrato
 *   quebra a compilação, não vira `undefined` em produção.
 * - `numeric`: alinha à direita com `tabular-nums` (dígitos alinham entre linhas).
 * - `sticky` + `width`: a coluna gruda na borda durante o scroll horizontal do mobile. `width`
 *   é obrigatório quando `sticky` (a tabela usa pra calcular o deslocamento de colunas
 *   grudadas empilhadas).
 * - `weight`: hierarquia da §2 — `primary` (decide em meio segundo), `tertiary` (contexto).
 */
export type OpportunityColumn = {
  header: string
  cell: (row: Opportunity) => ReactNode
  numeric?: boolean
  sticky?: 'left' | 'right'
  width?: string
  weight?: 'primary' | 'tertiary'
  className?: string
}

const WEIGHT_CLASS: Record<string, string> = {
  primary: 'font-semibold text-foreground',
  tertiary: 'text-xs text-foreground-subtle',
}

function stickyStyle(
  columns: OpportunityColumn[],
  column: OpportunityColumn,
): CSSProperties | undefined {
  if (!column.sticky)
    return column.width ? { minWidth: column.width } : undefined
  const sameSide = columns.filter((c) => c.sticky === column.sticky)
  const index = sameSide.indexOf(column)
  const stack =
    column.sticky === 'left'
      ? sameSide.slice(0, index)
      : sameSide.slice(index + 1)
  const offset = stack.reduce(
    (acc, c) => (acc ? `${acc} + ${c.width ?? '0px'}` : (c.width ?? '0px')),
    '',
  )
  return {
    minWidth: column.width,
    width: column.width,
    [column.sticky]: offset ? `calc(${offset})` : 0,
  }
}

function cellClasses(column: OpportunityColumn, isHeader: boolean): string {
  return [
    'h-11 px-3 whitespace-nowrap',
    isHeader
      ? 'text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-foreground-subtle'
      : 'py-2 align-middle',
    column.numeric ? 'text-right tabular-nums' : 'text-left',
    !isHeader && column.weight ? WEIGHT_CLASS[column.weight] : '',
    column.sticky
      ? isHeader
        ? 'sticky top-0 z-30 bg-surface'
        : 'sticky z-10 bg-background group-hover:bg-surface'
      : '',
    !isHeader ? (column.className ?? '') : '',
  ]
    .filter(Boolean)
    .join(' ')
}

export function OpportunityTable({
  title,
  description,
  caption,
  rows,
  columns,
  rowKey,
  loading = false,
  minWidth = '64rem',
}: {
  title: string
  description: string
  caption?: string
  rows: Opportunity[]
  columns: OpportunityColumn[]
  rowKey: (row: Opportunity) => string
  loading?: boolean
  minWidth?: string
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-background shadow-2xl shadow-black/20">
      <div className="flex items-center justify-between border-b border-border bg-surface/70 px-5 py-3">
        <div>
          <h2 className="text-sm font-bold text-foreground">{title}</h2>
          <p className="mt-0.5 text-xs text-foreground-subtle">{description}</p>
        </div>
        <span className="rounded-full bg-surface-raised px-2.5 py-1 text-xs font-semibold text-foreground-muted">
          {loading ? '…' : `${rows.length} nesta página`}
        </span>
      </div>
      {loading ? (
        <TabelaCarregando
          columns={columns.length}
          rows={6}
          label={`Carregando ${caption ?? title}…`}
        />
      ) : (
        <div className="max-h-[70vh] overflow-auto">
          <table
            className="w-full border-separate border-spacing-0 text-sm"
            style={{ minWidth }}
          >
            <caption className="sr-only">{caption ?? title}</caption>
            <thead className="sticky top-0 z-20">
              <tr>
                {columns.map((column, index) => (
                  <th
                    key={index}
                    scope="col"
                    className={`border-b border-border bg-surface ${cellClasses(column, true)}`}
                    style={stickyStyle(columns, column)}
                  >
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={rowKey(row)}
                  className="group transition-colors hover:bg-surface"
                >
                  {columns.map((column, index) => (
                    <td
                      key={index}
                      className={`border-b border-border ${cellClasses(column, false)}`}
                      style={stickyStyle(columns, column)}
                    >
                      {column.cell(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
