import { Skeleton } from '@/components/ui/skeleton'

/**
 * Skeleton no FORMATO da tabela (task 3.5/14 §3, task 3.5/21): mesma altura de linha `h-11`,
 * mesmo número de colunas — não um spinner genérico. É o estado de carregando de
 * `OpportunityTable`.
 */
export function TabelaCarregando({
  columns = 6,
  rows = 4,
  label = 'Carregando resultados…',
}: {
  columns?: number
  rows?: number
  label?: string
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="overflow-hidden rounded-2xl border border-border bg-background"
    >
      <span className="sr-only">{label}</span>
      <div aria-hidden="true">
        {Array.from({ length: rows }, (_, row) => (
          <div
            key={row}
            className="flex h-11 items-center gap-4 border-b border-border px-3 last:border-b-0"
          >
            {Array.from({ length: columns }, (_, col) => (
              <Skeleton
                key={col}
                className={col === 0 ? 'h-4 flex-[2]' : 'h-4 flex-1'}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
