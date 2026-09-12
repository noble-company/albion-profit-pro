import { useId, useRef, useState } from 'react'

import { ItemImage } from '@/components/ItemImage'
import { EstadoErro, EstadoVazio } from '@/components/ui/states'
import { useBuscaItens } from '@/items/hooks'
import type { CatalogItem, SearchFilters } from '@/items/service'
import { formatarNomeItem } from '@/lib/formatters'

/**
 * Combobox de busca de item, com navegação completa por teclado (task 3.5/24 item 3):
 * `↑`/`↓` movem o item ativo via `aria-activedescendant`, `Enter` seleciona, `Esc` fecha,
 * `Home`/`End` vão pras pontas. Compartilhado pela Busca e pela Calculadora.
 *
 * `value` é o texto atual do campo (identificador cru ou o que o usuário digitou); `onChange`
 * dispara a cada tecla **e** ao escolher (aí com o `unique_name` canônico). `onSelect` avisa
 * a escolha completa — a Busca usa pra navegar, a Calculadora pra preencher o formulário.
 */
export function ItemAutocomplete({
  label,
  value,
  onChange,
  onSelect,
  filters = {},
  placeholder = 'Ex.: algodão, cotton, T4_CLOTH',
  error,
  autoFocus,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  onSelect?: (item: CatalogItem) => void
  filters?: SearchFilters
  placeholder?: string
  error?: string
  autoFocus?: boolean
}) {
  const baseId = useId()
  const listId = `${baseId}-list`
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)

  const result = useBuscaItens(value, filters)
  const items = result.data
  const showPanel = open && value.trim().length >= 2

  const commit = (item: CatalogItem) => {
    onChange(item.unique_name)
    onSelect?.(item)
    setOpen(false)
    setActive(-1)
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setOpen(false)
      setActive(-1)
      return
    }
    if (!showPanel || items.length === 0) {
      if (event.key === 'ArrowDown') setOpen(true)
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((index) => (index + 1) % items.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((index) => (index <= 0 ? items.length - 1 : index - 1))
    } else if (event.key === 'Home') {
      event.preventDefault()
      setActive(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      setActive(items.length - 1)
    } else if (event.key === 'Enter' && active >= 0) {
      event.preventDefault()
      const chosen = items[active]
      if (chosen) commit(chosen)
    }
  }

  return (
    <div className="relative flex flex-col gap-1">
      <label className="text-xs font-bold uppercase tracking-wide text-foreground-subtle">
        {label}
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded={showPanel && items.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            active >= 0 ? `${baseId}-option-${active}` : undefined
          }
          autoFocus={autoFocus}
          value={value}
          placeholder={placeholder}
          onChange={(event) => {
            onChange(event.target.value)
            setOpen(true)
            setActive(-1)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          className="mt-1 min-h-11 w-full rounded-lg border border-border-strong bg-background px-3 py-2 text-sm font-medium normal-case tracking-normal text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30"
        />
      </label>
      {error && <small className="text-danger">{error}</small>}
      {result.needsMore && (
        <p className="text-xs text-foreground-subtle">
          Digite pelo menos 2 caracteres.
        </p>
      )}
      {showPanel && (
        <div
          id={listId}
          role="listbox"
          aria-label={`Resultados para ${label}`}
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-80 overflow-auto rounded-xl border border-border-strong bg-surface p-1 shadow-2xl shadow-black/30"
        >
          {result.isLoading && (
            <p role="status" className="p-3 text-sm text-foreground-muted">
              Buscando…
            </p>
          )}
          {Boolean(result.error) && (
            <EstadoErro title="Não foi possível buscar itens" />
          )}
          {!result.isLoading && !result.error && items.length === 0 && (
            <EstadoVazio title="Nenhum item encontrado" />
          )}
          {items.map((item, index) => (
            <button
              key={item.unique_name}
              id={`${baseId}-option-${index}`}
              role="option"
              type="button"
              aria-selected={index === active}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => commit(item)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition ${
                index === active
                  ? 'bg-primary/15 text-foreground'
                  : 'text-foreground hover:bg-surface-raised'
              }`}
            >
              {/* Pedido no uso (2026-09-12): o ícone do jogo e só o nome do jogo. O código
                  técnico (`T4_MAIN_SWORD`) saiu — o tier e o encanto já estão no nome. */}
              <ItemImage uniqueName={item.unique_name} size={64} className="size-8" />
              <span className="min-w-0 flex-1 truncate font-medium">
                {formatarNomeItem(
                  item.name_pt ?? item.name_en,
                  item.unique_name,
                )}
              </span>
              {!item.has_recipe && (
                <span className="shrink-0 rounded bg-surface-raised px-1.5 py-0.5 text-xs text-foreground-subtle">
                  sem receita
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
