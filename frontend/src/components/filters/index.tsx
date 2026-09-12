import { Search, X } from 'lucide-react'
import { useId, type ReactNode } from 'react'

import { Checkbox } from '@/components/ui/checkbox'

/**
 * Primitivos de filtro para a **coluna** (task 4/09).
 *
 * A família de `components/opportunities/FilterPanel.tsx` foi desenhada para grade horizontal
 * acima da tabela — três fieldsets de 4 a 6 colunas. Numa sidebar de 288 px aquilo não cabe, e
 * espremer geraria a quarta cópia de `fieldLabel`/`fieldControl` que a `F05` já combateu uma
 * vez.
 *
 * Aqui tudo empilha, o rótulo fica acima do controle, e a altura mínima de 44 px do alvo de
 * toque é preservada (`13-linguagem-visual.md` §1).
 */

export const filterLabel =
  'block text-xs font-medium uppercase tracking-wide text-foreground-subtle'

export const filterControl =
  'mt-1.5 min-h-9 w-full rounded-lg border border-border-strong bg-background px-2.5 py-1.5 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30'

export function FilterGroup({
  legend,
  children,
}: {
  legend: string
  children: ReactNode
}) {
  return (
    <fieldset className="space-y-3">
      <legend className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
        <span className="h-px w-4 bg-primary" aria-hidden="true" />
        {legend}
      </legend>
      {children}
    </fieldset>
  )
}

export function FilterSearch({
  value,
  onChange,
  placeholder = 'Buscar item…',
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-foreground-subtle"
        aria-hidden="true"
      />
      <input
        type="search"
        aria-label="Buscar item"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`${filterControl} mt-0 pl-8 pr-8`}
      />
      {value && (
        <button
          type="button"
          aria-label="Limpar busca"
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-foreground-subtle transition hover:text-foreground"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

/**
 * Multi-seleção por chips. Não existia no produto: tier e encantamento eram `<select>` de valor
 * único, então "T4 e T5" era impossível de pedir.
 *
 * Nenhum chip marcado significa **todos**, não nenhum — é o padrão que o usuário espera de um
 * scanner, e o rótulo diz isso em vez de deixar adivinhar.
 *
 * Genérico em `T` por causa da cidade: o identificador dela é texto (`'1002'`), e a alternativa
 * era uma segunda cópia deste componente só para trocar o tipo do valor.
 */
export function FilterChips<T extends string | number>({
  label,
  options,
  selected,
  onToggle,
  formatOption = String,
  titleOption,
  emptyHint = 'todos',
}: {
  label: string
  options: readonly T[]
  selected: readonly T[]
  onToggle: (value: T) => void
  formatOption?: (value: T) => string
  /** explicação no hover — para chip cujo rótulo é um número que não se explica sozinho */
  titleOption?: (value: T) => string
  /** o que "nenhum marcado" significa. Nem sempre é "todos": num atalho, é "personalizado". */
  emptyHint?: string
}) {
  return (
    <div role="group" aria-label={label}>
      <span className={filterLabel}>
        {label}
        {selected.length === 0 && (
          <span className="ml-1 normal-case text-foreground-subtle">· {emptyHint}</span>
        )}
      </span>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {options.map((option) => {
          const active = selected.includes(option)
          return (
            <button
              key={String(option)}
              type="button"
              title={titleOption?.(option)}
              aria-pressed={active}
              onClick={() => onToggle(option)}
              className={`min-h-8 rounded-md border px-2.5 text-xs font-semibold transition ${
                active
                  ? 'border-primary bg-primary/15 text-primary'
                  : 'border-border-strong text-foreground-muted hover:border-primary/40 hover:text-foreground'
              }`}
            >
              {formatOption(option)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Campo numérico. `error` (task 4/14, corrige `E05`): a mensagem fica **fora** do rótulo, ligada
 * por `aria-describedby` — dentro dele, o leitor de tela leria o erro como parte do nome do campo.
 */
export function FilterNumberField({
  label,
  value,
  onChange,
  placeholder,
  suffix,
  error,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  suffix?: string
  error?: string | null
}) {
  const idDoErro = useId()
  return (
    <div>
      <label className={filterLabel}>
        {label}
        {suffix && <span className="ml-1 normal-case">({suffix})</span>}
        <input
          type="text"
          inputMode="decimal"
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? idDoErro : undefined}
          className={`${filterControl} tabular-nums ${
            error ? 'border-danger focus:border-danger focus:ring-danger/30' : ''
          }`}
        />
      </label>
      {error && (
        <p id={idDoErro} className="mt-1 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

export function FilterSelectField({
  label,
  value,
  onChange,
  options,
  allLabel = 'Todas',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
  allLabel?: string
}) {
  return (
    <label className={filterLabel}>
      {label}
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={filterControl}
      >
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function FilterCheckbox({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-lg px-1 py-1.5 transition hover:bg-surface-raised">
      <Checkbox
        checked={checked}
        onCheckedChange={(next) => onChange(next === true)}
        className="mt-0.5"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{label}</span>
        {description && (
          <span className="block text-xs text-foreground-subtle">{description}</span>
        )}
      </span>
    </label>
  )
}
