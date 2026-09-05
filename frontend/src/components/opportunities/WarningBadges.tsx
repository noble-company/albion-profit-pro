import { ConfidenceBadge } from '@/design/ConfidenceBadge'

/**
 * Lista de avisos de uma oportunidade, sobre o vocabulário de confiança da task 3.5/14
 * (`src/design/confidence.ts`). Substitui o mapa `warningLabels` que vivia solto em
 * `production-pages.tsx`. Renderiza nada quando não há aviso.
 */
export function WarningBadges({
  warnings,
  className,
}: {
  warnings: readonly string[] | null | undefined
  className?: string
}) {
  if (!warnings || warnings.length === 0) return null
  return (
    <div className={`flex flex-wrap gap-1 ${className ?? ''}`}>
      {warnings.map((warning) => (
        <ConfidenceBadge key={warning} warning={warning} />
      ))}
    </div>
  )
}
