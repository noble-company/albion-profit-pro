import { ArrowDown, ArrowUp } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'

import type {
  Opportunity,
  SortDirection,
  SortField,
} from '@/opportunities/service'
import { ALTURA_DA_LINHA_REM, emEscala } from '@/scanner/altura'
import { CELULA_FIXA } from '@/scanner/ScannerTable'

import { TabelaCarregando } from './TabelaCarregando'

export type OpportunityColumn = {
  key: string
  header: string
  width: string
  cell: (row: Opportunity) => ReactNode
  sortField?: SortField
  numeric?: boolean
  sticky?: 'left' | 'right'
  weight?: 'primary' | 'tertiary'
  className?: string
}

const ALTURA_DO_CABECALHO_REM = 2.75

const WEIGHT_CLASS: Record<string, string> = {
  primary: 'font-semibold text-foreground',
  tertiary: 'text-xs text-foreground-subtle',
}

function stickyStyle(
  columns: OpportunityColumn[],
  column: OpportunityColumn,
): CSSProperties {
  const style: CSSProperties = {
    minWidth: column.width,
    width: column.width,
  }
  if (!column.sticky) return style

  const sameSide = columns.filter((candidate) => candidate.sticky === column.sticky)
  const index = sameSide.indexOf(column)
  const stack =
    column.sticky === 'left' ? sameSide.slice(0, index) : sameSide.slice(index + 1)
  const offset = stack.map((candidate) => candidate.width).join(' + ')
  style[column.sticky] = offset ? `calc(${offset})` : 0
  return style
}

function cellClasses(column: OpportunityColumn, isHeader: boolean): string {
  return [
    'px-3 whitespace-nowrap',
    isHeader
      ? 'sticky top-0 z-20 border-b border-border bg-surface-raised text-2xs font-semibold uppercase tracking-wide text-foreground-subtle'
      : 'border-b border-border/60 py-2 align-middle',
    column.numeric ? 'text-right tabular-nums' : 'text-left',
    !isHeader && column.weight ? WEIGHT_CLASS[column.weight] : '',
    column.sticky === 'left'
      ? `${CELULA_FIXA} ${isHeader ? 'z-30 bg-surface-raised' : 'bg-surface group-hover:bg-surface-raised'}`
      : column.sticky === 'right'
        ? `sticky ${isHeader ? 'z-30 bg-surface-raised' : 'z-10 bg-surface group-hover:bg-surface-raised'}`
        : '',
    !isHeader ? (column.className ?? '') : '',
  ]
    .filter(Boolean)
    .join(' ')
}

export function OpportunityTable({
  caption = 'Oportunidades de Market Flip',
  rows,
  columns,
  rowKey,
  sort,
  direction,
  onSortChange,
  loading = false,
}: {
  caption?: string
  rows: Opportunity[]
  columns: OpportunityColumn[]
  rowKey: (row: Opportunity) => string
  sort: SortField
  direction: SortDirection
  onSortChange: (field: SortField, direction: SortDirection) => void
  loading?: boolean
}) {
  const toggleSort = (field: SortField) => {
    onSortChange(field, sort === field && direction === 'desc' ? 'asc' : 'desc')
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-surface">
      {loading ? (
        <TabelaCarregando columns={columns.length} rows={6} label={`Carregando ${caption}…`} />
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-max min-w-full table-fixed border-separate border-spacing-0 text-sm">
            <caption className="sr-only">{caption}</caption>
            <thead>
              <tr style={{ height: emEscala(ALTURA_DO_CABECALHO_REM) }}>
                {columns.map((column) => {
                  const active = column.sortField === sort
                  const Icon = direction === 'desc' ? ArrowDown : ArrowUp
                  return (
                    <th
                      key={column.key}
                      scope="col"
                      aria-sort={
                        active
                          ? direction === 'desc'
                            ? 'descending'
                            : 'ascending'
                          : undefined
                      }
                      className={cellClasses(column, true)}
                      style={stickyStyle(columns, column)}
                    >
                      {column.sortField ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(column.sortField!)}
                          className="inline-flex items-center gap-1 uppercase tracking-wide transition hover:text-foreground"
                        >
                          {column.header}
                          {active && <Icon className="size-3" aria-hidden="true" />}
                        </button>
                      ) : (
                        column.header
                      )}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={rowKey(row)}
                  className="group transition-colors hover:bg-surface-raised"
                  style={{ height: emEscala(ALTURA_DA_LINHA_REM) }}
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={cellClasses(column, false)}
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
