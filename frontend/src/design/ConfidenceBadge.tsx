import { AlertCircle, Info, PackageSearch, type LucideIcon } from 'lucide-react'

import {
  confidenceLevelFor,
  WARNING_LABELS,
  type ConfidenceLevel,
} from './confidence'

/**
 * Demonstração da task 3.5/14 (docs/13-linguagem-visual.md §4). O componente reutilizável
 * das telas de oportunidade é `@/components/opportunities/WarningBadges` (task 3.5/20), que
 * renderiza uma lista destes badges a partir de `row.warnings`.
 */

const LEVEL_STYLE: Record<
  ConfidenceLevel,
  { icon: LucideIcon; className: string }
> = {
  observacao: { icon: Info, className: 'border-info/30 bg-info/10 text-info' },
  atencao: {
    icon: AlertCircle,
    className: 'border-warning/30 bg-warning/10 text-warning',
  },
  'sem-dado': {
    icon: PackageSearch,
    className: 'border-border-strong bg-surface-raised text-foreground-subtle',
  },
}

export function ConfidenceBadge({
  warning,
  compact = false,
}: {
  warning: string
  compact?: boolean
}) {
  const level = confidenceLevelFor(warning)
  const { icon: Icon, className } = LEVEL_STYLE[level]
  const label = WARNING_LABELS[warning] ?? warning
  return (
    <span
      title={compact ? label : undefined}
      className={`inline-flex items-center rounded-full border text-xs font-medium ${
        compact ? 'p-1' : 'gap-1.5 px-2 py-0.5'
      } ${className}`}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      <span className={compact ? 'sr-only' : undefined}>{label}</span>
    </span>
  )
}
