/**
 * Vocabulário de confiança da task 3.5/14 (docs/13-linguagem-visual.md §4).
 * Dados/lógica separados de ConfidenceBadge.tsx só pra não misturar export de componente
 * com export de constante/função no mesmo arquivo (react-refresh/only-export-components).
 */

export type ConfidenceLevel = 'observacao' | 'atencao' | 'sem-dado'

const WARNING_TO_LEVEL: Record<string, ConfidenceLevel> = {
  order_not_guaranteed: 'observacao',
  stale_data: 'atencao',
  insufficient_depth: 'atencao',
  no_coverage: 'sem-dado',
  no_price: 'sem-dado',
}

export const WARNING_LABELS: Record<string, string> = {
  order_not_guaranteed: 'Ordem não garantida',
  stale_data: 'Preço desatualizado',
  insufficient_depth: 'Profundidade insuficiente',
  no_coverage: 'Mercado sem cobertura',
  no_price: 'Preço indisponível',
}

export const DEMO_WARNINGS = Object.keys(WARNING_TO_LEVEL)

export function confidenceLevelFor(warning: string): ConfidenceLevel {
  return WARNING_TO_LEVEL[warning] ?? 'atencao'
}
