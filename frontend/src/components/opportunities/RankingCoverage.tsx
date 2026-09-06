import { Clock, Info } from 'lucide-react'

import { formatarIdade } from '@/lib/formatters'
import type { components } from '@/api/schema'

type Coverage = components['schemas']['RankingCoverage']

/**
 * Cobertura do ranking materializado (task 3.5/22 item 2, corrige `B02`/`W6`). O ranking é
 * pré-calculado por um job (task 03) sobre o universo inteiro de receitas — o usuário precisa
 * saber quantas têm preço, quando foi a última reconstrução, e que os números da **lista** são
 * estimativa (o cálculo exato é o "Analisar", `POST /craft/simulate`).
 */
export function RankingCoverage({ coverage }: { coverage: Coverage }) {
  const {
    priced_recipes,
    evaluated_recipes,
    total_recipes,
    computed_at,
    stale,
  } = coverage
  return (
    <div
      className={`rounded-2xl border px-4 py-3 text-xs ${
        stale
          ? 'border-warning/40 bg-warning/10 text-warning'
          : 'border-border bg-surface/60 text-foreground-subtle'
      }`}
    >
      <p className="font-medium">
        {priced_recipes.toLocaleString('pt-BR')} receitas com preço ·{' '}
        {evaluated_recipes.toLocaleString('pt-BR')} avaliadas de{' '}
        {total_recipes.toLocaleString('pt-BR')} no total
      </p>
      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1">
          <Clock className="size-3.5" aria-hidden="true" />
          {computed_at
            ? `Ranking recalculado ${formatarIdade(computed_at)}`
            : 'Ranking ainda não calculado'}
          {stale && ' · desatualizado'}
        </span>
        <span className="inline-flex items-center gap-1 text-foreground-subtle">
          <Info className="size-3.5" aria-hidden="true" />
          Valores da lista são estimativa — abra "Analisar" para o cálculo
          exato.
        </span>
      </p>
    </div>
  )
}
