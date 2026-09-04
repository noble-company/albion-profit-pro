/**
 * Vocabulário de confiança da task 3.5/14 (docs/13-linguagem-visual.md §4).
 * Dados/lógica separados de ConfidenceBadge.tsx só pra não misturar export de componente
 * com export de constante/função no mesmo arquivo (react-refresh/only-export-components).
 */

export type ConfidenceLevel = 'observacao' | 'atencao' | 'sem-dado'

const WARNING_TO_LEVEL: Record<string, ConfidenceLevel> = {
  ordem_nao_garantida: 'observacao',
  dado_velho: 'atencao',
  profundidade_insuficiente: 'atencao',
  sem_cobertura: 'sem-dado',
  sem_preco: 'sem-dado',
}

export const WARNING_LABELS: Record<string, string> = {
  ordem_nao_garantida: 'Ordem não garantida',
  dado_velho: 'Preço desatualizado',
  profundidade_insuficiente: 'Profundidade insuficiente',
  sem_cobertura: 'Mercado sem cobertura',
  sem_preco: 'Preço indisponível',
}

export const DEMO_WARNINGS = Object.keys(WARNING_TO_LEVEL)

export function confidenceLevelFor(warning: string): ConfidenceLevel {
  return WARNING_TO_LEVEL[warning] ?? 'atencao'
}
