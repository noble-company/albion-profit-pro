import type { ReactNode } from 'react'

import type { Opportunity } from '@/opportunities/service'

/**
 * Coluna da tabela de oportunidades. `cell` recebe a linha (tipada pelo schema OpenAPI —
 * `OpportunityOut`), então uma mudança de contrato quebra a compilação em vez de virar
 * `undefined` em produção (F05, item 4).
 */
export type OpportunityColumn = {
  header: string
  cell: (row: Opportunity) => ReactNode
  headerClassName?: string
  cellClassName?: string
}

export function OpportunityTable({
  title,
  description,
  caption,
  rows,
  columns,
  rowKey,
}: {
  title: string
  description: string
  caption?: string
  rows: Opportunity[]
  columns: OpportunityColumn[]
  rowKey: (row: Opportunity) => string
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-background shadow-2xl shadow-black/20">
      <div className="flex items-center justify-between border-b border-border bg-surface/70 px-5 py-3">
        <div>
          <h2 className="text-sm font-bold text-foreground">{title}</h2>
          <p className="mt-0.5 text-xs text-foreground-subtle">{description}</p>
        </div>
        <span className="rounded-full bg-surface-raised px-2.5 py-1 text-xs font-semibold text-foreground-muted">
          {rows.length} nesta página
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1120px] text-left text-sm">
          <caption className="sr-only">{caption ?? title}</caption>
          <thead className="bg-surface/80 text-[0.68rem] uppercase tracking-[0.12em] text-foreground-subtle">
            <tr>
              {columns.map((column, index) => (
                <th key={index} className={column.headerClassName ?? 'p-4'}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                className="border-t border-border transition-colors hover:bg-surface"
              >
                {columns.map((column, index) => (
                  <td key={index} className={column.cellClassName ?? 'p-4'}>
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
