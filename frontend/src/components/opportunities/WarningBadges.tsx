import { ConfidenceBadge } from '@/design/ConfidenceBadge'

/**
 * Lista de avisos de uma oportunidade, sobre o vocabulário de confiança da task 3.5/14
 * (`src/design/confidence.ts`). Substitui o mapa `warningLabels` que vivia solto em
 * telas de oportunidade. Renderiza nada quando não há aviso.
 */
export function WarningBadges({
  warnings,
  className,
  compact = false,
}: {
  warnings: readonly string[] | null | undefined
  className?: string
  compact?: boolean
}) {
  if (!warnings || warnings.length === 0) return null
  return (
    <div className={`flex flex-wrap gap-1 ${className ?? ''}`}>
      {warnings.map((warning) => (
        <ConfidenceBadge key={warning} warning={warning} compact={compact} />
      ))}
    </div>
  )
}
