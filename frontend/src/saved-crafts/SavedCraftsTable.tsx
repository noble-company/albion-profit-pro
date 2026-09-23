import { useVirtualizer } from '@tanstack/react-virtual'
import {
  ArrowDown,
  ArrowUp,
  Calculator,
  ChevronRight,
  Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'

import { useEscalaAtual } from '@/app/escala'
import { ItemImage } from '@/components/ItemImage'
import { Button } from '@/components/ui/button'
import { EstadoVazio } from '@/components/ui/states'
import { formatarQualidade, partesDoNomeItem } from '@/lib/formatters'
import { divide, formatPercent, formatSilver } from '@/lib/money'
import { ALTURA_DA_LINHA_REM, alturaDaLinhaPx, emEscala } from '@/scanner/altura'
import { idadeDaCotacao, TRACO } from '@/scanner/tela'
import { motivoSemPreco } from '@/scanner/columns'
import { formatarVolume } from '@/scanner/vendas'

import type { SavedCraftView } from './calculation'
import type { SavedCraftSort, SavedCraftSortField } from './sorting'

const HEADERS: ReadonlyArray<{
  label: string
  field?: SavedCraftSortField
  align?: 'right'
}> = [
  { label: 'Item', field: 'name' },
  { label: 'Plano' },
  { label: 'Mercado' },
  { label: 'Investimento', field: 'totalCost', align: 'right' },
  { label: 'Vende/dia', field: 'volume', align: 'right' },
  { label: 'Atualização', field: 'freshness' },
  { label: 'Lucro', field: 'profit', align: 'right' },
  { label: 'ROI', field: 'roi', align: 'right' },
  { label: 'Ações', align: 'right' },
]

const GRID = [14, 9, 10, 8, 7, 8, 9, 6, 13]
  .map((width) => emEscala(width))
  .join(' ')

const MODES: Record<string, string> = {
  immediate: 'imediata',
  buy_order: 'ordem de compra',
  sell_order: 'ordem de venda',
}

export function SavedCraftsTable({
  views,
  locationName,
  sort,
  onSortChange,
  expandedId,
  onToggle,
  renderDetail,
  onRemove,
  removingId,
}: {
  views: SavedCraftView[]
  locationName: (id: string) => string
  sort: SavedCraftSort
  onSortChange: (sort: SavedCraftSort) => void
  expandedId: string | null
  onToggle: (id: string) => void
  renderDetail: (view: SavedCraftView) => ReactNode
  onRemove: (id: string) => void
  removingId: string | null
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const escala = useEscalaAtual()
  const getItemKey = useCallback((index: number) => views[index]?.saved.id ?? index, [views])
  const virtualizer = useVirtualizer({
    count: views.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => alturaDaLinhaPx(escala),
    getItemKey,
    overscan: 8,
    initialRect: { width: 1200, height: 600 },
  })
  useEffect(() => virtualizer.measure(), [escala, virtualizer])

  const toggleSort = (field: SavedCraftSortField) => {
    onSortChange(
      sort.field === field
        ? { field, direction: sort.direction === 'asc' ? 'desc' : 'asc' }
        : { field, direction: field === 'name' ? 'asc' : 'desc' },
    )
  }

  if (views.length === 0) {
    return <EstadoVazio title="Nenhum craft salvo" />
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-surface">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
        <div className="w-max min-w-full">
          <div
            role="row"
            className="sticky top-0 z-20 grid h-11 items-center gap-2 border-b border-border bg-surface-raised px-3 text-xs font-semibold uppercase tracking-wide text-foreground-subtle"
            style={{ gridTemplateColumns: GRID }}
          >
            {HEADERS.map(({ label, field, align }, index) => {
              const active = field === sort.field
              const Icon = sort.direction === 'asc' ? ArrowUp : ArrowDown
              return (
                <div
                  key={label}
                  role="columnheader"
                  aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined}
                  className={`${align === 'right' ? 'text-right' : ''} ${
                    index === 0 ? 'sticky left-0 z-10 -ml-3 bg-surface-raised pl-3' : ''
                  }`}
                >
                  {field ? (
                    <button
                      type="button"
                      className={`inline-flex items-center gap-1 uppercase ${active ? 'text-primary' : ''}`}
                      onClick={() => toggleSort(field)}
                    >
                      {label}
                      {active && <Icon className="size-3" aria-hidden="true" />}
                    </button>
                  ) : (
                    label
                  )}
                </div>
              )
            })}
          </div>
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const view = views[virtualRow.index]
              if (!view) return null
              const { saved, row, item, volume } = view
              const open = expandedId === saved.id
              const confirming = confirmingId === saved.id
              const name = item?.name_pt ?? item?.name_en ?? saved.output_item
              const parts = partesDoNomeItem(name, saved.output_item)
              const analysisHref = view.productionKind === 'refining'
                ? `/refino?q=${encodeURIComponent(saved.output_item)}&qty=${saved.quantity}`
                : `/calculadora?item=${encodeURIComponent(saved.output_item)}&qty=${saved.quantity}&quality=${saved.output_quality}`
              const analysisLabel = view.productionKind === 'refining' ? 'Refino' : 'Calculadora'
              const mode = row
                ? `${MODES[row.acquisitionMode ?? ''] ?? TRACO} / ${MODES[row.saleMode ?? ''] ?? TRACO}`
                : TRACO
              return (
                <div
                  key={saved.id}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  className="absolute left-0 top-0 w-full"
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  <div
                    role="row"
                    className={`group grid items-center gap-2 border-b border-border/60 px-3 text-sm hover:bg-surface-raised ${open ? 'bg-surface-raised' : ''}`}
                    style={{ gridTemplateColumns: GRID, height: emEscala(ALTURA_DA_LINHA_REM) }}
                  >
                    <div role="cell" className="sticky left-0 -ml-3 flex h-full min-w-0 items-center gap-2 bg-surface pl-3 group-hover:bg-surface-raised">
                      <ItemImage uniqueName={saved.output_item} size={64} className="size-9 shrink-0" />
                      <span className="flex min-w-0 flex-col leading-tight">
                        <span className="line-clamp-2 font-medium">{item ? parts.nome : 'Receita indisponível'}</span>
                        <span className="text-xs text-foreground-subtle">
                          {parts.grau ? `${parts.grau} · ` : ''}{formatarQualidade(saved.output_quality)}
                        </span>
                      </span>
                    </div>
                    <div role="cell" className="flex flex-col leading-tight">
                      <span>{saved.quantity.toLocaleString('pt-BR')} receitas</span>
                      <span className="text-xs text-foreground-subtle">{row ? `${row.producedQuantity.toLocaleString('pt-BR')} itens` : TRACO}</span>
                    </div>
                    <div role="cell" className="flex min-w-0 flex-col leading-tight">
                      <span className="truncate text-buy-side">{row?.saleBasis === 'city' ? locationName(row.locationId) : (row?.saleSource ?? TRACO)}</span>
                      <span className="truncate text-xs text-foreground-subtle">{mode}</span>
                    </div>
                    <div role="cell" className="text-right tabular-nums">{formatSilver(row?.totalCost)}</div>
                    <div role="cell" className="text-right tabular-nums">{volume ? formatarVolume(volume) : TRACO}</div>
                    <div role="cell" className="text-foreground-muted">{row ? (idadeDaCotacao(row.oldestObservedAt, new Date()) ?? TRACO) : TRACO}</div>
                    <div role="cell" className={`flex flex-col text-right font-semibold tabular-nums ${row?.profit?.isNegative() ? 'text-danger' : row?.profit ? 'text-profit' : ''}`}>
                      <span>
                        {row && row.state !== 'priced'
                          ? `Sem cotação atual · ${motivoSemPreco(row)}`
                          : formatSilver(row?.profit)}
                      </span>
                      <span className="text-xs font-normal">{row?.profit && row.producedQuantity > 0 ? `${formatSilver(divide(row.profit, String(row.producedQuantity)))}/un.` : TRACO}</span>
                    </div>
                    <div role="cell" className="text-right font-semibold tabular-nums">{row?.roi ? formatPercent(row.roi) : TRACO}</div>
                    <div role="cell" className="flex justify-end gap-1">
                      {confirming ? (
                        <>
                          <Button size="sm" variant="destructive" disabled={removingId === saved.id} onClick={() => onRemove(saved.id)}>Confirmar</Button>
                          <Button size="sm" variant="ghost" onClick={() => setConfirmingId(null)}>Cancelar</Button>
                        </>
                      ) : (
                        <>
                          <Button size="icon" variant="ghost" aria-label={open ? `Fechar ${name}` : `Abrir ${name}`} onClick={() => onToggle(saved.id)}>
                            <ChevronRight className={`transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden="true" />
                          </Button>
                          <Button asChild size="icon" variant="ghost">
                            <Link to={analysisHref} aria-label={`Abrir ${name} em ${analysisLabel}`}><Calculator aria-hidden="true" /></Link>
                          </Button>
                          <Button size="icon" variant="ghost" aria-label={`Remover ${name}`} onClick={() => setConfirmingId(saved.id)}>
                            <Trash2 aria-hidden="true" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  {open && (
                    <div className="border-b border-border bg-surface-raised/40 px-3 py-3">
                      {renderDetail(view)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
