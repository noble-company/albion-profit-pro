import { LoaderCircle, Star } from 'lucide-react'
import type { MouseEvent } from 'react'

export function SavedCraftButton({
  saved,
  pending,
  unavailable = false,
  compact = false,
  onSave,
}: {
  saved: boolean
  pending: boolean
  unavailable?: boolean
  compact?: boolean
  onSave: () => void
}) {
  const label = unavailable
    ? 'Não foi possível consultar Meus Crafts'
    : saved
      ? 'Receita salva em Meus Crafts'
      : pending
        ? 'Salvando em Meus Crafts'
        : 'Salvar em Meus Crafts'

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    if (!saved && !pending && !unavailable) onSave()
  }

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={saved || pending || unavailable}
      onClick={handleClick}
      className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-border-strong text-xs font-medium transition hover:border-primary/50 hover:text-primary disabled:cursor-default disabled:opacity-70 ${
        compact ? 'size-8' : 'min-h-9 px-3'
      } ${saved ? 'border-primary/50 text-primary' : 'text-foreground-muted'}`}
    >
      {pending ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <Star className={`size-4 ${saved ? 'fill-current' : ''}`} aria-hidden="true" />
      )}
      {!compact && <span>{saved ? 'Salvo' : pending ? 'Salvando…' : 'Salvar'}</span>}
    </button>
  )
}
