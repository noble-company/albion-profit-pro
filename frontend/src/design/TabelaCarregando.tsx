import { Skeleton } from '@/components/ui/skeleton'

/**
 * Demonstração da task 3.5/14 (docs/13-linguagem-visual.md §3) — skeleton no FORMATO da
 * tabela real (mesma altura de linha, mesmo número de colunas), não um spinner genérico.
 * A task 20 decide se isso vira parte de `OpportunityTable` ou fica um componente à parte.
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
      className="overflow-hidden rounded-lg border border-border"
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
