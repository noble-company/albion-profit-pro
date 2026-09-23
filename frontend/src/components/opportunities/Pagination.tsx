import { Button } from '@/components/ui/button'

/**
 * Paginação do servidor (F08) das telas de oportunidade. `onOffsetChange` só mexe no
 * `offset` — preserva todo o resto da URL. Renderiza nada quando não há resultado.
 */
export function Pagination({
  offset,
  limit,
  total,
  onOffsetChange,
}: {
  offset: number
  limit: number
  total: number
  onOffsetChange: (offset: number) => void
}) {
  if (total <= 0) return null
  const page = Math.floor(offset / limit) + 1
  const pages = Math.ceil(total / limit)
  return (
    <nav
      aria-label="Paginação do Market Flip"
      className="flex shrink-0 items-center justify-center gap-3 text-sm text-foreground-muted"
    >
      <Button
        variant="outline"
        size="sm"
        disabled={offset === 0}
        onClick={() => onOffsetChange(Math.max(0, offset - limit))}
      >
        Anterior
      </Button>
      <span> Página {page} de {pages} </span>
      <Button
        variant="outline"
        size="sm"
        disabled={offset + limit >= total}
        onClick={() => onOffsetChange(offset + limit)}
      >
        Próxima
      </Button>
    </nav>
  )
}
