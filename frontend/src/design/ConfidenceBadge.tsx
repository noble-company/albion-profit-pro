import { AlertCircle, Info, PackageSearch, type LucideIcon } from 'lucide-react'

import {
  confidenceLevelFor,
  WARNING_LABELS,
  type ConfidenceLevel,
} from './confidence'

/**
 * Demonstração da task 3.5/14 (docs/13-linguagem-visual.md §4) — não é o componente
 * definitivo. `WarningBadges`, reutilizável e ligado ao schema real de avisos, é extraído
 * na task 20 sobre este vocabulário.
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

export function ConfidenceBadge({ warning }: { warning: string }) {
  const level = confidenceLevelFor(warning)
  const { icon: Icon, className } = LEVEL_STYLE[level]
  const label = WARNING_LABELS[warning] ?? warning
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${className}`}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {label}
    </span>
  )
}
