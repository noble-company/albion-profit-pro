import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'

// Chrome dos campos de filtro. O CSS à mão de index.css saiu na task 12; o polimento visual
// das telas é das tasks 21–24. Aqui só se compartilha o que era copiado byte a byte.
export const fieldLabel =
  'flex flex-col gap-1.5 text-xs font-bold uppercase tracking-wide text-foreground-subtle'
export const fieldControl =
  'min-h-11 rounded-lg border border-border-strong bg-background/75 px-3 py-2 text-sm font-medium normal-case tracking-normal text-foreground outline-none transition hover:border-border-strong focus:border-primary focus:ring-2 focus:ring-primary/30'

export function FilterPanel({
  title,
  description,
  onClear,
  children,
}: {
  title: string
  description: string
  onClear: () => void
  children: ReactNode
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface/70 shadow-2xl shadow-black/20">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="font-bold text-foreground">{title}</h2>
          <p className="mt-0.5 text-xs text-foreground-subtle">{description}</p>
        </div>
        <Button variant="outline" size="sm" onClick={onClear}>
          Limpar filtros
        </Button>
      </div>
      <div className="space-y-6 p-5">{children}</div>
    </div>
  )
}

const ACCENT_BAR: Record<string, string> = {
  primary: 'bg-primary/60',
  'buy-side': 'bg-buy-side/60',
  'sell-side': 'bg-sell-side/60',
}

export function FilterFieldset({
  accent,
  legend,
  children,
}: {
  accent: 'primary' | 'buy-side' | 'sell-side'
  legend: string
  children: ReactNode
}) {
  return (
    <fieldset className="border-t border-border pt-5 first:border-t-0 first:pt-0">
      <legend className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-foreground-subtle">
        <span className={`h-px w-5 ${ACCENT_BAR[accent]}`} /> {legend}
      </legend>
      {children}
    </fieldset>
  )
}

export function FilterSelect({
  label,
  value,
  onChange,
  options,
  labels,
  suffix,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: string[]
  labels?: string[]
  suffix?: string
}) {
  return (
    <label className={fieldLabel}>
      {label}
      <select
        aria-label={label}
        className={fieldControl}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Todos</option>
        {options.map((option, index) => (
          <option key={option} value={option}>
            {labels?.[index] ?? (suffix ? `${option}${suffix}` : option)}
          </option>
        ))}
      </select>
    </label>
  )
}

const SORT_OPTIONS: ReadonlyArray<readonly [string, string]> = [
  ['profit_desc', 'Lucro (maior → menor)'],
  ['profit_asc', 'Lucro (menor → maior)'],
  ['roi_desc', 'ROI (maior → menor)'],
  ['roi_asc', 'ROI (menor → maior)'],
  ['freshness_desc', 'Atualização (mais recente)'],
  ['freshness_asc', 'Atualização (mais antiga)'],
]

export function FilterSortSelect({
  value,
  onChange,
  className,
}: {
  value: string
  onChange: (value: string) => void
  className?: string
}) {
  return (
    <label className={`${fieldLabel} ${className ?? ''}`}>
      Ordenar por
      <select
        aria-label="Ordenar por"
        className={fieldControl}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {SORT_OPTIONS.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  )
}

export function FilterNumber({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  return (
    <label className={fieldLabel}>
      {label}
      <input
        aria-label={label}
        className={fieldControl}
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  )
}

export function FilterToggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label
      className={`flex min-h-[4.5rem] cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${checked ? 'border-primary/45 bg-primary/10' : 'border-surface-raised bg-background/55 hover:border-border-strong'}`}
    >
      <Switch checked={checked} onCheckedChange={onChange} />
      <span className="min-w-0">
        <strong className="block text-sm text-foreground">{label}</strong>
        <span className="mt-0.5 block text-xs font-normal leading-snug text-foreground-subtle">
          {description}
        </span>
      </span>
    </label>
  )
}
