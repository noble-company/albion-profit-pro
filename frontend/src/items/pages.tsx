import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'

import { ItemAutocomplete } from '@/components/ItemAutocomplete'
import { traduzirCategoria } from '@/i18n/categories'
import { useCategories } from '@/opportunities/hooks'
// Task 4/09: as classes vêm do módulo canônico; a cópia local daqui foi a terceira do projeto.
import { filterControl, filterLabel } from '@/components/filters'


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
        <label className={`${filterLabel} flex flex-col gap-1`}>
          Tier
          <select
            aria-label="Filtrar por tier"
            value={tier}
            onChange={(event) => setTier(event.target.value)}
            className={filterControl}
          >
            <option value="">Todos</option>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((value) => (
              <option key={value} value={value}>
                T{value}
              </option>
            ))}
          </select>
        </label>
        <label className={`${filterLabel} flex flex-col gap-1`}>
          Encantamento
          <select
            aria-label="Filtrar por encantamento"
            value={enchantment}
            onChange={(event) => setEnchantment(event.target.value)}
            className={filterControl}
          >
            <option value="">Todos</option>
            {[0, 1, 2, 3, 4].map((value) => (
              <option key={value} value={value}>
                .{value}
              </option>
            ))}
          </select>
        </label>
        <label className={`${filterLabel} flex flex-col gap-1`}>
          Categoria
          <select
            aria-label="Filtrar por categoria"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className={filterControl}
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
