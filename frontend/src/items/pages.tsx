import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'

import { ItemAutocomplete } from '@/components/ItemAutocomplete'
import { traduzirCategoria } from '@/i18n/categories'
import { useCategories } from '@/opportunities/hooks'

const fieldLabel =
  'flex flex-col gap-1 text-xs font-bold uppercase tracking-wide text-foreground-subtle'
const fieldControl =
  'mt-1 min-h-11 rounded-lg border border-border-strong bg-background px-3 py-2 text-sm font-medium normal-case tracking-normal text-foreground'

export function BuscaItem() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [tier, setTier] = useState('')
  const [enchantment, setEnchantment] = useState('')
  const [category, setCategory] = useState('')
  const [craftable, setCraftable] = useState(false)
  const categories = useCategories()
  const categoryOptions = useMemo(
    () => [...new Set(categories.map((item) => item.category))].sort(),
    [categories],
  )
  const filters = useMemo(
    () => ({
      tier: tier ? Number(tier) : undefined,
      enchantment_level: enchantment ? Number(enchantment) : undefined,
      categoria: category || undefined,
      apenas_craftaveis: craftable || undefined,
    }),
    [category, craftable, enchantment, tier],
  )

  return (
    <section>
      <h1 className="text-3xl font-bold">Busca de itens</h1>
      <p className="mt-2 text-foreground-muted">
        Pesquise em português, inglês ou pelo identificador do item.
      </p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <ItemAutocomplete
            label="Item"
            value={query}
            onChange={setQuery}
            onSelect={(item) =>
              void navigate(`/item/${encodeURIComponent(item.unique_name)}`)
            }
            filters={filters}
          />
        </div>
        <label className={fieldLabel}>
          Tier
          <select
            aria-label="Filtrar por tier"
            value={tier}
            onChange={(event) => setTier(event.target.value)}
            className={fieldControl}
          >
            <option value="">Todos</option>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((value) => (
              <option key={value} value={value}>
                T{value}
              </option>
            ))}
          </select>
        </label>
        <label className={fieldLabel}>
          Encantamento
          <select
            aria-label="Filtrar por encantamento"
            value={enchantment}
            onChange={(event) => setEnchantment(event.target.value)}
            className={fieldControl}
          >
            <option value="">Todos</option>
            {[0, 1, 2, 3, 4].map((value) => (
              <option key={value} value={value}>
                .{value}
              </option>
            ))}
          </select>
        </label>
        <label className={fieldLabel}>
          Categoria
          <select
            aria-label="Filtrar por categoria"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className={fieldControl}
          >
            <option value="">Todas</option>
            {categoryOptions.map((option) => (
              <option key={option} value={option}>
                {traduzirCategoria(option)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="mt-4 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={craftable}
          onChange={(event) => setCraftable(event.target.checked)}
        />{' '}
        Somente craftáveis
      </label>
    </section>
  )
}
