export type KpiTone = 'primary' | 'profit' | 'info'

const TONES: Record<KpiTone, string> = {
  primary: 'from-primary/15 text-primary before:bg-primary',
  profit: 'from-profit/15 text-profit before:bg-profit',
  info: 'from-info/15 text-info before:bg-info',
}

/**
 * Cartão de indicador do cabeçalho das telas de oportunidade (F05, task 3.5/20). `tone` usa
 * tokens semânticos da task 12 — nada de `'amber' | 'emerald' | 'sky'`.
 */
export function KpiCard({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: KpiTone
}) {
  return (
    <article
      className={`relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br ${TONES[tone]} to-surface/80 p-5 shadow-lg shadow-black/10 before:absolute before:inset-y-0 before:left-0 before:w-1`}
    >
      <p className="text-2xs font-bold uppercase tracking-[0.16em] text-foreground-subtle">
        {label}
      </p>
      <p className="mt-2 text-2xl font-black tracking-tight">{value}</p>
    </article>
  )
}
